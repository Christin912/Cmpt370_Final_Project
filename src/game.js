class Game {
  constructor(state) {
    this.state = state;
    this.spawnedObjects = [];
    this.collidableObjects = [];
    this.score = 0;
    this.playerSpeed = 5;

    // Jump configuration
    this.jumpConfig = {
      jumpStrength: 7,
      holdBoostStrength: 0.3,
      maxHoldBoostTime: 0.2,
      coyoteTime: 0.15,
      jumpBufferTime: 0.15,
      allowDoubleJump: true
    };

    // Jump state
    this.jumpState = { 
      lastGroundTime: 0,
      lastJumpPressTime: -999,
      jumpStartTime: 0,
      usedDoubleJump: false,
      isJumping: false,
      rotationCount: 0,
      spinAxis: 'z',
      spinRemaining: 0,
      spinSpeed: Math.PI * 2 // radians per second
    };

    // Platform management
    this.platformSegments = new Map();
    this.segmentLength = 20;
    this.spawnAheadSegments = 5;
    this.despawnBehindSegments = 2;
    this.platformY = 0;

    // Enemy management
    this.enemies = new Map();
    this.maxSpawnHeight = 1.5;
    this.minSpawnHeight = 0;
    this.minSpawnInterval = 2; // seconds
    this.maxSpawnInterval = 5; // seconds
    this.lastEnemySpawnTime = 0;

    this.enemyConfig = {
      spawnDistance : this.segmentLength * (this.spawnAheadSegments - 1),
      despawnDistanceAhead : this.segmentLength * (this.spawnAheadSegments + 2),
      maxActive : 12
    };
    this.nextEnemySpawnInterval = (Math.random() * (this.maxSpawnInterval - this.minSpawnInterval)) + this.minSpawnInterval;
  }

  async resetScene() {
    console.log("[Game] Resetting scene");

    this.score = 0;
    this.playerSpeed = 5;

    // Remove all enemies
    for (const [name] of this.enemies) {
      this.state.objects = this.state.objects.filter(obj => obj.name !== name);
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
    }
    this.enemies.clear();

    // reset player
    if (this.Player && this.initialPlayerPosition) {
      vec3.copy(this.Player.model.position, this.initialPlayerPosition);
      this.Player.velocity[1] = 0;
      this.Player.isOnGround = false;
      this.platformY = this.Player.model.position[1] - 0.5 * this.Player.model.scale[1] - 0.01; // slightly below player
      //const initialSegmentIndex = Math.floor(this.Player.model.position[0] / this.segmentLength);
      //await this.platformManager(initialSegmentIndex);
    }

    // reset jump state
    this.jumpState.lastGroundTime = performance.now() / 1000;
    this.jumpState.lastJumpPressTime = -999;
    this.jumpState.jumpStartTime = 0;
    this.jumpState.usedDoubleJump = false;
    this.jumpState.isJumping = false;
    this.jumpState.rotationCount = 0;
    this.jumpState.spinRemaining = 0;

    // reset platform segments
    for (const index of Array.from(this.platformSegments.keys())) {
      this.despawnPlatformSegment(index);
    }

    if (this.Player) {
      const initialSegmentIndex = Math.floor(this.Player.model.position[0] / this.segmentLength);
      await this.platformManager(initialSegmentIndex);
      await this.platformUnderPlayer();
    }

    console.log("[Game] Scene reset complete");
  }

  async platformUnderPlayer() {
    if (!this.Player) return;
    const segmentIndex = Math.floor(this.Player.model.position[0] / this.segmentLength);

    if (!this.platformSegments.has(segmentIndex)) {
      await this.spawnPlatformSegment(segmentIndex);
    }

    const platform = this.platformSegments.get(segmentIndex);
    if (!platform) return;

    const pAABB = computeAABB(platform);
    const platformTop = pAABB.center[1] + pAABB.half[1];

    const margin = 0.35 * this.Player.model.scale[0];
    const leftBound = pAABB.center[0] - pAABB.half[0] + margin;
    const rightBound = pAABB.center[0] + pAABB.half[0] - margin;

    this.platformY = pAABB.center[1];

    if (this.Player.model.position[0] < leftBound) {
      this.Player.model.position[0] = leftBound;
    } else if (this.Player.model.position[0] > rightBound) {
      this.Player.model.position[0] = rightBound;
    }
    this.Player.model.position[1] = platformTop + 0.05 * this.Player.model.scale[1]; // slightly above platform

    this.Player.velocity[1] = 0;
    this.Player.isOnGround = true;
    this.jumpState.rotationCount = 0;
    this.jumpState.spinRemaining = 0;
    this.jumpState.lastGroundTime = performance.now() / 1000;
    this.jumpState.usedDoubleJump = false;
    this.jumpState.isJumping = false;
  }
  
  async spawnEnemies() {
    // Implementation for spawning enemies
    if (!this.Player) return;
    if (this.enemies.size >= this.enemyConfig.maxActive) return;

    const xBase = this.Player.model.position[0] + this.enemyConfig.spawnDistance;
    const x = xBase + (Math.random() * this.segmentLength);
    const y = this.platformY + this.minSpawnHeight + Math.random() * (this.maxSpawnHeight - this.minSpawnHeight);
    const z = 0;

    const enemyName = `Enemy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const enemy = await spawnObject({
      name : enemyName,
      type: "mesh",
      fileName : "tetrahedron.obj",
      position: vec3.fromValues(x, y, z),
      scale: vec3.fromValues(0.06, 0.06, 0.06),
      material: {
        diffuse: [0, 0, 1]
      },
    }, this.state);
    enemy.enemyBehavior = {
        rotspeed: {
          x: (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1),
          y: (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1),
          z: (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1)
        },
        undulate: Math.random() < 0.5,
        amp: 0.2 + Math.random() * 0.04,
        freq: 0.5 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        baseY: y
    };
    this.enemies.set(enemyName, enemy);
    this.createBoxCollider(enemy, [1.5, 1.5, 1.5]);
    console.log(`[Enemy] Spawned ${enemyName} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  }

  despawnEnemies() {
    // Implementation for despawning enemies
    const toDelete = [];
    for (const [name, enemy] of this.enemies) {
      const dx = enemy.model.position[0] - this.Player.model.position[0];
      if (dx > this.enemyConfig.despawnDistanceAhead || dx < -this.segmentLength * this.despawnBehindSegments) {
        toDelete.push(name);
      }
    }

    for (const name of toDelete) {
      //const enemy = this.enemies.get(name);
      this.state.objects = this.state.objects.filter(obj => obj.name !== name);
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
      this.enemies.delete(name);
      console.log(`[Enemy] Despawned ${name}`);
    }
  }

  async enemyManager() {
    // Implementation for managing enemies
    const currentTime = performance.now() / 1000;
    if (currentTime - this.lastEnemySpawnTime >= this.nextEnemySpawnInterval) {
      await this.spawnEnemies();
      this.lastEnemySpawnTime = currentTime;
      this.nextEnemySpawnInterval = (Math.random() * (this.maxSpawnInterval - this.minSpawnInterval)) + this.minSpawnInterval;
    }
    this.despawnEnemies();
  }

  updateEnemies(deltaTime, currentTime) {
    for (const enemy of this.enemies.values()) {
      const behavior = enemy.enemyBehavior;
      if (!behavior) continue;
    
      if (behavior.rotspeed) {
        if (behavior.rotspeed.x) enemy.rotate('x', behavior.rotspeed.x * deltaTime);
        if (behavior.rotspeed.y) enemy.rotate('y', behavior.rotspeed.y * deltaTime);
        if (behavior.rotspeed.z) enemy.rotate('z', behavior.rotspeed.z * deltaTime);
      }

      if (behavior.undulate) {
        const twoPi = Math.PI * 2;
        const y = behavior.baseY + Math.sin(twoPi * behavior.freq * currentTime + behavior.phase) * behavior.amp;
        enemy.model.position[1] = y;
      }
    }
  }

  triggerJumpRotation() {
    const horizontalDir = this.Player.velocity && this.Player.velocity[0] || 1; // default forward if constant speed
    const movingHorizontally = Math.abs(horizontalDir) > 0;

    this.jumpState.spinAxis = movingHorizontally ? 'z' : 'x';
    const sign = movingHorizontally ? (horizontalDir >= 0 ? -1 : 1) : 1;

    this.jumpState.spinRemaining = Math.PI / 2; // 90 degrees per jump
    this.jumpState.spinSpeed = Math.PI / 0.25; // radians per second
    this.jumpState.spinSign = sign;

    /*console.log('[Jump] spin init:', {
    axis: this.jumpState.spinAxis,
    sign: this.jumpState.spinSign,
    remaining: this.jumpState.spinRemaining,
    speed: this.jumpState.spinSpeed);*/
  }

  // Platform segment generator
  async spawnPlatformSegment(index) {
    if (this.platformSegments.has(index)) return this.platformSegments.get(index);
    const xCenter = index * this.segmentLength + this.segmentLength / 2;
    const platform = await spawnObject({
      name: `PlatformSegment_${index}`,
      type: "cube",
      material: {
        diffuse: [1, 1, 0]
      },
      position: vec3.fromValues(xCenter, this.platformY, 0),
      scale: vec3.fromValues(this.segmentLength * 2, 1, 1)
    }, this.state);

    this.platformSegments.set(index, platform);
    this.createBoxCollider(platform);
    console.log(`[Platform] Spawned segment ${index} at x=${xCenter}`);
    return platform;
  }

  // Platform segment remover
  despawnPlatformSegment(index) {
    const name = `PlatformSegment_${index}`;
    const platform = this.platformSegments.get(index);
    if (platform) {
      this.state.objects = this.state.objects.filter(obj => obj.name !== `PlatformSegment_${index}`);
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== `PlatformSegment_${index}`);
    } else {
      this.state.objects = this.state.objects.filter(obj => obj.name !== name); 
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
    }
    this.platformSegments.delete(index);
    console.log(`[Platform] Despawned segment ${index}`);
  }

  // Platform manager to spawn/despawn segments based on player position
  async platformManager(centerIndex) {
    const min = centerIndex - this.despawnBehindSegments;
    const max = centerIndex + this.spawnAheadSegments;
    for (let i = min; i <= max; i++) {
      if (!this.platformSegments.has(i)) {
        await this.spawnPlatformSegment(i);
      } 
    }
    for (const index of Array.from(this.platformSegments.keys())) {
      if (index < min || index > max) {
        this.despawnPlatformSegment(index);
      }
    }
  }
  
  // example - create a collider on our object with various fields we might need (you will likely need to add/remove/edit how this works)
  createSphereCollider(object, radius, onCollide = null) {
    object.collider = {
      type: "SPHERE",
      radius: radius,
      onCollide: onCollide ? onCollide : (otherObject) => {
        console.log(`Collided with ${otherObject.name}`);
      }
    };
    this.collidableObjects.push(object);
  }

  createBoxCollider(object, dimensions = null, onCollide = null) {
    const scale = [
      object.model.scale[0],
      object.model.scale[1],
      object.model.scale[2]
    ];
    object.collider = {
      type: "BOX",
      dimensions: dimensions ? dimensions : scale,
      onCollide: onCollide ? onCollide : (otherObject) => {
        console.log(`Collided with ${otherObject.name}`);
      }
    };
    this.collidableObjects.push(object);
  }

  // example - function to check if an object is colliding with collidable objects
  checkCollision(object) {
    // loop over all the other collidable objects 
    this.collidableObjects.forEach(otherObject => {
      // probably don't need to collide with ourselves
      if (object.name === otherObject.name || !object.collider || !otherObject.collider) {
        return;
      }
      
      const a = computeAABB(object);
      const b = computeAABB(otherObject);

      const isGround = otherObject.name && otherObject.name.startsWith("PlatformSegment_");

      const dx = Math.abs(a.center[0] - b.center[0]);
      const dy = Math.abs(a.center[1] - b.center[1]);
      const dz = Math.abs(a.center[2] - b.center[2]);

      const overlapX = (a.half[0] + b.half[0]) - dx;
      const overlapY = (a.half[1] + b.half[1]) - dy;
      const overlapZ = (a.half[2] + b.half[2]) - dz;
      
      if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
        if (overlapY <= overlapX && overlapY <= overlapZ) {
          if (object.velocity && object.velocity[1] < 0 && a.center[1] > b.center[1]) {
            const platformTop = b.center[1] + b.half[1];
            //const playerHalf = a.half[1];
            object.model.position[1] = platformTop + 0.25 * object.model.scale[1]; // snap
            object.velocity[1] = 0; // reset vertical velocity on Y collision
            object.isOnGround = true; // set on ground flag
            this.jumpState.rotationCount = 0;
            this.jumpState.spinRemaining = 0;
            this.jumpState.lastGroundTime = performance.now() / 1000;
            this.jumpState.usedDoubleJump = false;
            this.jumpState.isJumping = false;
          } else {
            const dir = (a.center[1] < b.center[1]) ? -1 : 1;
            object.model.position[1] += dir * overlapY;
            if (dir === 1 && object.velocity && object.velocity[1] <= 0) {
              object.velocity[1] = 0;
              object.isOnGround = true;
              this.jumpState.rotationCount = 0;
              this.jumpState.spinRemaining = 0;
              this.jumpState.lastGroundTime = performance.now() / 1000;
              this.jumpState.usedDoubleJump = false;
              this.jumpState.isJumping = false;
            }
          }
        }
        else if (!isGround && overlapX <= overlapZ) {
          const dir = (a.center[0] < b.center[0]) ? -1 : 1;
          object.model.position[0] += dir * overlapX;
        } else{
          const dir = (a.center[2] < b.center[2]) ? -1 : 1;
          object.model.position[2] += dir * overlapZ;
        }
        if (object.collider.onCollide) {
          object.collider.onCollide(otherObject);
        }
      }
      
      // do a check to see if we have collided, if we have we can call object.onCollide(otherObject) which will
      // call the onCollide we define for that specific object. This way we can handle collisions identically for all
      // objects that can collide but they can do different things (ie. player colliding vs projectile colliding)
      // use the modeling transformation for object and otherObject to transform position into current location
      // ie: 
      // if (collide){ object.collider.onCollide(otherObject) } // fires what we defined our object should do when it collides
    });
  }

  // runs once on startup after the scene loads the objects
  async onStart() {
    console.log("On start");

    // this just prevents the context menu from popping up when you right click
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    }, false);

    this.score = 0;
    this.playerSpeed = 5; // initial player speed

    // example - set an object in onStart before starting our render loop!
    this.Player = getObject(this.state, "Player");
    this.initialPlayerPosition = vec3.clone(this.Player.model.position);
    this.Player.velocity = vec3.fromValues(0, 0, 0); // custom property

    this.platformY = this.Player.model.position[1] - 0.5 * this.Player.model.scale[1] - 0.01; // slightly below player

    this.state.canvas.tabIndex = 0; // make canvas focusable
    this.state.canvas.focus();      // focus on the canvas to receive keyboard input
    window.focus();

    if (!this.Player) {
      console.error('[Platform] Player not found at start');
      return;
    }

    // Initialize platform segments
    const initialSegmentIndex = this.Player ? Math.floor(this.Player.model.position[0] / this.segmentLength) : 0;
    await this.platformManager(initialSegmentIndex);
    await this.spawnEnemies();
    this.lastEnemySpawnTime = performance.now() / 1000;

    // Initialize Satellite
    this.Satellite = getObject(this.state, "Satellite");

    // ====== CAMERA SETUP ======
    // Calculate the initial offset between camera and player
    this.CameraOffset = vec3.create();
    vec3.sub(this.CameraOffset, this.state.camera.position, this.Player.model.position);

    // Define all available camera modes
    this.CameraModes = {
      // Primary view: Original top-down-ish view
      primary: {
        offset: vec3.clone(this.CameraOffset),  // Use the original offset from scene file
        smooth: true,                            // Enable smooth camera movement
        smoothFactor: 0.1,                       // How fast camera catches up (0-1)
        lockY: true,                             // Keep Y position constant
        lookAtPlayer: true                       // Camera always looks at player
      },
      // Alternate view: Higher bird's eye view
      alt: {
        offset: vec3.fromValues(this.CameraOffset[0], this.CameraOffset[1] + 5, this.CameraOffset[2] - 5),
        smooth: true,
        smoothFactor: 0.1,
        lockY: false,                            // Allow Y to change
        lookAtPlayer: true
      },
      // NEW: Third person view - follows behind the player like a chase camera
      third_person: {
        offset: vec3.fromValues(-3, 2, 0),       // 3 units behind (negative X), 2 units above, centered on Z
        smooth: true,
        smoothFactor: 0.15,                      // Slightly more responsive than other views
        lockY: false,                            // Allow Y to change with player jumps
        lookAtPlayer: true                       // Always focus on player
      }
    };

    // Start with the primary camera mode
    this.activeCameraMode = 'primary';
    
    // Track if shift key is being held (prevents multiple switches from one press)
    this._shiftHeld = false;

    // example - create sphere colliders on our two objects as an example, we give 2 objects colliders otherwise
    // no collision can happen
    this.createBoxCollider(this.Player, null, (otherObject) => {
      if (otherObject.name.startsWith("Enemy_")) {
        setTimeout(() => { this.resetScene(); }, 10);
        return;
      }
      console.log(`[Collision] Player collided with ${otherObject.name}`);
    });
    
    // ====== INPUT HANDLERS ======
    
    // Space bar for jumping
    window.addEventListener("keydown", (e) => {
      const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
      if (isSpace) {
        const now = performance.now() / 1000;
        this.jumpState.lastJumpPressTime = now;
        this.jumpState.keyHeld = true;
        //console.log("[Input] Space down at", now.toFixed(3));
      }
    });

    window.addEventListener("keyup", (e) => {
      const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
      if (isSpace) {
        this.jumpState.isJumping = false; // stop hold boost
        this.jumpState.keyHeld = false;
        //console.log("[Input] Space up");
      }
    });

    // Shift key to cycle through camera modes
    window.addEventListener("keydown", (e) => {
      if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !this._shiftHeld) {
        this._shiftHeld = true;
        
        // Cycle through all three camera modes: primary -> alt -> third_person -> primary
        if (this.activeCameraMode === 'primary') {
          this.activeCameraMode = 'alt';
          console.log("[Camera] Switched to alt view");
        } else if (this.activeCameraMode === 'alt') {
          this.activeCameraMode = 'third_person';
          console.log("[Camera] Switched to third person view");
        } else {
          this.activeCameraMode = 'primary';
          console.log("[Camera] Switched to primary view");
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        this._shiftHeld = false;
      }
    });


    // example: spawn some stuff before the scene starts
    // for (let i = 0; i < 10; i++) {
    //     for (let j = 0; j < 10; j++) {
    //         for (let k = 0; k < 10; k++) {
    //             spawnObject({
    //                 name: `new-Object${i}${j}${k}`,
    //                 type: "cube",
    //                 material: {
    //                     diffuse: randomVec3(0, 1)
    //                 },
    //                 position: vec3.fromValues(4 - i, 5 - j, 10 - k),
    //                 scale: vec3.fromValues(0.5, 0.5, 0.5)
    //             }, this.state);
    //         }
    //     }
    // }

    // example: spawn in objects, set constantRotate to true for them (used below) and give them a collider
    //   for (let i = 0; i < 2; i++) {
    //     let tempObject = await spawnObject({
    //       name: `new-Object${i}`,
    //       type: "cube",
    //       material: {
    //         diffuse: randomVec3(0, 1)
    //       },
    //       position: vec3.fromValues(4 - i, 0, 0),
    //       scale: vec3.fromValues(0.5, 0.5, 0.5)
    //     }, this.state);


    //     tempObject.constantRotate = true;         // lets add a flag so we can access it later
    //     this.spawnedObjects.push(tempObject);     // add these to a spawned objects list
    //     this.collidableObjects.push(tempObject);  // say these can be collided into
    //   }
  }

  // Runs once every frame non stop after the scene loads
  async onUpdate(deltaTime) {
    // TODO - Here we can add game logic, like moving game objects, detecting collisions, you name it. Examples of functions can be found in sceneFunctions.
    const gravity = -9.81;
    this.score += deltaTime * 10; // increase score over time
    const el = document.getElementById('score');
    if (el) {
      el.textContent = `Score: ${Math.floor(this.score)}`;
    }

    if (this.score >= 5000) {
      this.playerSpeed = 100; // increase player speed after reaching score threshold
    }    
    else if (this.score >= 3000 && this.score < 5000) {
      this.playerSpeed = 85; // increase player speed after reaching score threshold
    } 
    else if (this.score >= 2750 && this.score < 3000) {
      this.playerSpeed = 70; // increase player speed after reaching score threshold
    }
    else if (this.score >= 2500 && this.score < 2750) {
      this.playerSpeed = 55; // increase player speed after reaching score threshold
    }
    else if (this.score >= 2250 && this.score < 2500) {
      this.playerSpeed = 40; // increase player speed after reaching score threshold
    }
    else if (this.score >= 2000 && this.score < 2250) {
      this.playerSpeed = 30; // increase player speed after reaching score threshold
    }
    else if (this.score >= 1750 && this.score < 2000) {
      this.playerSpeed = 25; // increase player speed after reaching score threshold
    }
    else if (this.score >= 1500 && this.score < 1750) {
      this.playerSpeed = 20; // increase player speed after reaching score threshold
    }
    else if (this.score >= 1000 && this.score < 1500) {
      this.playerSpeed = 15; // increase player speed after reaching score threshold
    }
    else if (this.score >= 750 && this.score < 1000) {
      this.playerSpeed = 10; // increase player speed after reaching score threshold
    }
    else if (this.score >= 500 && this.score < 750) {
      this.playerSpeed = 7; // increase player speed after reaching score threshold
    }

    const prevY = this.Player.model.position[1];
    this.Player.translate(vec3.fromValues(this.playerSpeed * deltaTime, 0, 0)); // move player along x-axis

    // ====== ROLLING ANIMATION ======
    // Make the cube rotate/flip as it moves forward (like Geometry Dash!)
    // Calculate rotation speed based on player speed so it looks natural
    const rotationSpeed = this.playerSpeed * 0.5; // Adjust 0.5 to make it roll faster/slower
    this.Player.rotate('z', -rotationSpeed * deltaTime); // Negative for forward rolling motion

    // apply gravity
    this.Player.velocity[1] += gravity * deltaTime; // apply gravity to vertical velocity
    if (this.Player.velocity[1] < -50) {
      this.Player.velocity[1] = -50; // terminal velocity
    }

    const currentTime = performance.now() / 1000;
    const jumpCFG = this.jumpConfig;
    const jumpST = this.jumpState;

    this.Player.isOnGround = false; // reset on ground flag each frame

    const onGround = this.Player.isOnGround;
    if (onGround) {
      jumpST.lastGroundTime = currentTime;
    }

    const pressedJump = (currentTime - jumpST.lastJumpPressTime) <= jumpCFG.jumpBufferTime;
    const isCoyote = (currentTime - jumpST.lastGroundTime) <= jumpCFG.coyoteTime;

    if (pressedJump && (onGround || isCoyote || (jumpCFG.allowDoubleJump && !jumpST.usedDoubleJump))) {
      this.Player.velocity[1] = jumpCFG.jumpStrength;
      jumpST.jumpStartTime = currentTime;
      jumpST.isJumping = true;

      // handle double jump usage
      if (!onGround && !isCoyote) {
        jumpST.usedDoubleJump = true; // mark double jump as used
      }

      const maxRotations = jumpCFG.allowDoubleJump ? 2 : 1;
      // trigger jump rotation
      if (jumpST.rotationCount < maxRotations) {
        this.triggerJumpRotation();
        jumpST.rotationCount += 1;
      }
      jumpST.lastJumpPressTime = -999; // reset jump press time to avoid double triggering
    }

    // Animation block for jump rotation
    if (!this.Player.isOnGround && this.jumpState.spinRemaining > 0) {
      const step = Math.min(this.jumpState.spinSpeed * deltaTime, this.jumpState.spinRemaining);
      const axis = this.jumpState.spinAxis;
      const signedStep = step * (this.jumpState.spinSign || 1);
      this.Player.rotate(axis, signedStep);
      this.jumpState.spinRemaining -= step;
      console.log('[Jump] spin step:', { axis, step: signedStep, remaining: this.jumpState.spinRemaining });
    }

    // hold boost
    if (jumpST.isJumping) {
      const holdTime = currentTime - jumpST.jumpStartTime;
      const canHold = (jumpST.lastJumpPressTime === -999) ? true : (currentTime - jumpST.lastJumpPressTime) <= jumpCFG.maxHoldBoostTime;
      if (canHold && holdTime <= jumpCFG.maxHoldBoostTime && this.Player.velocity[1] > 0) {
        this.Player.velocity[1] += jumpCFG.holdBoostStrength * deltaTime;
      } else {
        jumpST.isJumping = false; // stop hold boost
      }
    }

    this.Player.translate(vec3.fromValues(0, this.Player.velocity[1] * deltaTime, 0)); // update position based on velocity

    // Platform collision detection
    {
      const playerBottomPrev = prevY + this.Player.centroid[1] - 0.25 * this.Player.model.scale[1];
      const playerBottomNow  = this.Player.model.position[1] + this.Player.centroid[1] - 0.25 * this.Player.model.scale[1];
      let landed = false;
      const candidates = [];

      for (const segment of this.platformSegments.values()) {
        const pAABB = computeAABB(segment);
        const playerAABB = computeAABB(this.Player);

        // Horizontal overlap check
        //const overlapX = Math.abs(pAABB.center[0] - playerAABB.center[0]) <= (pAABB.half[0] + playerAABB.half[0]);
        //const overlapZ = Math.abs(pAABB.center[2] - playerAABB.center[2]) <= (pAABB.half[2] + playerAABB.half[2]);
        //const epsilon = 0.05;
        const overlapX = (pAABB.half[0] + playerAABB.half[0]) - Math.abs(pAABB.center[0] - playerAABB.center[0]);
        const overlapZ = (pAABB.half[2] + playerAABB.half[2]) - Math.abs(pAABB.center[2] - playerAABB.center[2]);
        //if (!overlapX || !overlapZ) continue;
        if (overlapX <= 0 || overlapZ <= 0) continue; // require significant horizontal overlap

        const platformTop = pAABB.center[1] + pAABB.half[1];
        const crossedDownThroughTop = playerBottomPrev >= platformTop && playerBottomNow <= platformTop;
        if (crossedDownThroughTop && this.Player.velocity[1] <= 0) {
          // Snap to top
          candidates.push({ pAABB, platformTop, overlapX});
        }
          //this.Player.model.position[1] = platformTop + 0.5 * this.Player.model.scale[1]; // snap to top of platform
          //this.Player.velocity[1] = 0;
          //this.Player.isOnGround = true;
          //this.jumpState.rotationCount = 0;
          //this.jumpState.spinRemaining = 0;
          //landed = true;
          //break;
        
      }

      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (b.overlapX > a.overlapX) ? b : a);
        const margin = 0.35 * this.Player.model.scale[0];
        const leftBound = best.pAABB.center[0] - best.pAABB.half[0] + margin;
        const rightBound = best.pAABB.center[0] + best.pAABB.half[0] - margin;

        if (this.Player.model.position[0] < leftBound) {
          this.Player.model.position[0] = leftBound;
        } else if (this.Player.model.position[0] > rightBound) {
          this.Player.model.position[0] = rightBound;
        }

        this.Player.model.position[1] = best.platformTop + 0.05 * this.Player.model.scale[1]; // slightly above platform
        this.Player.velocity[1] = 0;
        this.Player.isOnGround = true;
        this.jumpState.rotationCount = 0;
        this.jumpState.spinRemaining = 0;
        this.jumpState.lastGroundTime = currentTime;
        this.jumpState.usedDoubleJump = false;
        this.jumpState.isJumping = false;
        landed = true;
      }
      if (!landed) {
        // remain airborne; isOnGround already false earlier
      }
    }
    if (this.Satellite && this.Satellite.rotate) {
      this.Satellite.rotate('z', deltaTime * 0.2); // rotate the satellite slowly
    }

    this.checkCollision(this.Player); // check for collisions on the player every frame

    // ====== CAMERA UPDATE LOGIC ======
    if (this.Player) {
      // Get the currently active camera mode settings
      const mode = this.CameraModes[this.activeCameraMode];
      
      // Calculate where the camera should be based on player position + offset
      const desiredPosition = vec3.create();
      vec3.add(desiredPosition, this.Player.model.position, mode.offset);
      
      // Apply smooth camera movement if enabled
      if (mode.smooth) {
        // Calculate the difference between current and desired position
        const delta = vec3.create();
        vec3.sub(delta, desiredPosition, this.state.camera.position);
        // Move only a fraction of that distance (smoothFactor) each frame
        vec3.scale(delta, delta, mode.smoothFactor);
        vec3.add(this.state.camera.position, this.state.camera.position, delta);
      } else {
        // No smoothing - jump directly to desired position
        vec3.copy(this.state.camera.position, desiredPosition);
      }
      
      // Lock Y axis if specified (keeps camera at constant height)
      if (mode.lockY) {
        this.state.camera.position[1] = desiredPosition[1];
      }
      
      // Make camera always look at the player if enabled
      if (mode.lookAtPlayer) {
        const toPlayer = vec3.create();
        vec3.sub(toPlayer, this.Player.model.position, this.state.camera.position);
        vec3.normalize(toPlayer, toPlayer);
        vec3.copy(this.state.camera.front, toPlayer);
      }
    }
    
    const currentSegmentIndex = Math.floor(this.Player.model.position[0] / this.segmentLength);
    await this.platformManager(currentSegmentIndex);
    await this.enemyManager(deltaTime);
    this.updateEnemies(deltaTime, currentTime);

    // example: Rotate a single object we defined in our start method
    // this.cube.rotate('x', deltaTime * 0.5);

    // example: Rotate all objects in the scene marked with a flag
    // this.state.objects.forEach((object) => {
    //   if (object.constantRotate) {
    //     object.rotate('y', deltaTime * 0.5);
    //   }
    // });

    // simulate a collision between the first spawned object and 'cube' 
    // if (this.spawnedObjects[0].collidable) {
    //     this.spawnedObjects[0].onCollide(this.cube);
    // }

    // example: Rotate all the 'spawned' objects in the scene
    // this.spawnedObjects.forEach((object) => {
    //     object.rotate('y', deltaTime * 0.5);
    // });


    // example - call our collision check method on our cube
    // this.checkCollision(this.cube);
  }
}