class Game {
  constructor(state) {
    this.state = state;
    this.spawnedObjects = [];
    this.collidableObjects = [];
    this.score = 0;
    this.playerSpeed = 5;

    // Collectibles system
    this.collectibles = new Map();
    this.collectibleValue = 100;
    this.streak = 0;
    this.multiplier = 1;
    this.maxMultiplier = 10;
    this.collectibleSpacing = 24; // Distance between collectibles (tripled from 8)
    this.lastCollectibleX = 0;
    this.nextCollectibleX = 0;
    this.missedCollectibleX = null; // Track if we passed a collectible without collecting

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

  // Update multiplier display
  updateHUD() {
    const scoreEl = document.getElementById('score');
    const multiplierEl = document.getElementById('multiplier');
    const streakEl = document.getElementById('streak');
    
    if (scoreEl) {
      scoreEl.textContent = `Score: ${Math.floor(this.score)}`;
    }
    if (multiplierEl) {
      multiplierEl.textContent = `Multiplier: x${this.multiplier}`;
    }
    if (streakEl) {
      streakEl.textContent = `Streak: ${this.streak}`;
    }
  }

  // Spawn a collectible star
  async spawnCollectible(xPos) {
    const yHeight = this.platformY + 1.5 + Math.random() * 0.5; // Slightly above platform
    const collectibleName = `Collectible_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    const collectible = await spawnObject({
      name: collectibleName,
      type: "cube", // Using cube as a simple collectible
      material: {
        diffuse: [1, 1, 0] // Yellow/gold color
      },
      position: vec3.fromValues(xPos, yHeight, 0),
      scale: vec3.fromValues(0.4, 0.4, 0.4), // Made slightly bigger
    }, this.state);

    // Add rotation behavior
    collectible.collectibleBehavior = {
      rotSpeed: 2.0,
      bobSpeed: 2.0,
      bobAmount: 0.15,
      baseY: yHeight
    };

    this.collectibles.set(collectibleName, {
      object: collectible,
      xPos: xPos,
      collected: false
    });

    // Create a larger collision box for easier collection
    this.createBoxCollider(collectible, [2.0, 2.0, 2.0], (otherObject) => {
      if (otherObject.name === "Player") {
        const collectibleData = this.collectibles.get(collectibleName);
        if (collectibleData && !collectibleData.collected) {
          this.collectCollectible(collectibleName);
        }
      }
    });

    console.log(`[Collectible] Spawned at x=${xPos.toFixed(2)}, y=${yHeight.toFixed(2)}`);
  }

  // Collect a collectible
  collectCollectible(collectibleName) {
    const collectibleData = this.collectibles.get(collectibleName);
    if (!collectibleData || collectibleData.collected) {
      console.log(`[Collectible] Already collected or not found: ${collectibleName}`);
      return;
    }

    console.log(`[Collectible] COLLECTING ${collectibleName}!`);
    collectibleData.collected = true;
    
    // Increase streak and multiplier
    this.streak++;
    this.multiplier = Math.min(this.maxMultiplier, Math.floor(1 + this.streak / 3));
    
    // Add score with multiplier
    const points = this.collectibleValue * this.multiplier;
    this.score += points;
    
    // Remove the collectible visually
    this.state.objects = this.state.objects.filter(obj => obj.name !== collectibleName);
    this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== collectibleName);
    
    console.log(`[Collectible] ✓ Collected! +${points} points (x${this.multiplier} multiplier, streak: ${this.streak})`);
    console.log(`[Collectible] New score: ${Math.floor(this.score)}`);
    
    this.updateHUD();
  }

  // Break streak if player passes a collectible
  breakStreak() {
    if (this.streak > 0) {
      console.log(`[Collectible] Streak broken! Was at ${this.streak}`);
      this.streak = 0;
      this.multiplier = 1;
      this.updateHUD();
    }
  }

  // Manage collectible spawning and despawning
  async manageCollectibles() {
    if (!this.Player) return;

    const playerX = this.Player.model.position[0];
    
    // Spawn new collectibles ahead of player
    while (this.nextCollectibleX < playerX + this.segmentLength * this.spawnAheadSegments) {
      await this.spawnCollectible(this.nextCollectibleX);
      this.nextCollectibleX += this.collectibleSpacing;
    }

    // Check for missed collectibles and despawn old ones
    const toDelete = [];
    for (const [name, data] of this.collectibles) {
      const dx = data.xPos - playerX;
      
      // If player passed the collectible without collecting it
      if (!data.collected && dx < -2.0 && this.missedCollectibleX !== data.xPos) {
        this.missedCollectibleX = data.xPos;
        this.breakStreak();
      }
      
      // Despawn collectibles that are far behind
      if (dx < -this.segmentLength * this.despawnBehindSegments) {
        toDelete.push(name);
      }
    }

    // Remove old collectibles
    for (const name of toDelete) {
      const collectibleData = this.collectibles.get(name);
      if (collectibleData && !collectibleData.collected) {
        this.state.objects = this.state.objects.filter(obj => obj.name !== name);
        this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
      }
      this.collectibles.delete(name);
      console.log(`[Collectible] Despawned ${name}`);
    }
  }

  // Update collectible animations
  updateCollectibles(deltaTime, currentTime) {
    for (const [name, data] of this.collectibles) {
      if (data.collected) continue;
      
      const collectible = data.object;
      const behavior = collectible.collectibleBehavior;
      if (!behavior) continue;

      // Rotate the collectible
      collectible.rotate('y', behavior.rotSpeed * deltaTime);
      
      // Bob up and down
      const bobOffset = Math.sin(currentTime * behavior.bobSpeed) * behavior.bobAmount;
      collectible.model.position[1] = behavior.baseY + bobOffset;
    }
  }

  // reset scene to initial state
  async resetScene() {
    console.log("[Game] Resetting scene");

    this.score = 0;
    this.playerSpeed = 5;
    this.streak = 0;
    this.multiplier = 1;
    this.missedCollectibleX = null;

    // Remove all enemies
    for (const [name] of this.enemies) {
      this.state.objects = this.state.objects.filter(obj => obj.name !== name);
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
    }
    this.enemies.clear();

    // Remove all collectibles
    for (const [name] of this.collectibles) {
      this.state.objects = this.state.objects.filter(obj => obj.name !== name);
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
    }
    this.collectibles.clear();

    // reset player
    if (this.Player && this.initialPlayerPosition) {
      vec3.copy(this.Player.model.position, this.initialPlayerPosition);
      this.Player.velocity[1] = 0;
      this.Player.isOnGround = false;
      this.platformY = this.Player.model.position[1] - 0.5 * this.Player.model.scale[1] - 0.01;
      
      // Reset collectible spawning
      this.nextCollectibleX = this.Player.model.position[0] + 5; // Start spawning ahead
      this.lastCollectibleX = this.nextCollectibleX - this.collectibleSpacing;
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

    this.updateHUD();
    console.log("[Game] Scene reset complete");
  }

  // position player above platform
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
    this.Player.model.position[1] = platformTop + 0.05 * this.Player.model.scale[1];

    this.Player.velocity[1] = 0;
    this.Player.isOnGround = true;
    this.jumpState.rotationCount = 0;
    this.jumpState.spinRemaining = 0;
    this.jumpState.lastGroundTime = performance.now() / 1000;
    this.jumpState.usedDoubleJump = false;
    this.jumpState.isJumping = false;
  }
  
  // spawn enemies ahead of player
  async spawnEnemies() {
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

  // remove enemies whem they are behind player
  despawnEnemies() {
    const toDelete = [];
    for (const [name, enemy] of this.enemies) {
      const dx = enemy.model.position[0] - this.Player.model.position[0];
      if (dx > this.enemyConfig.despawnDistanceAhead || dx < -this.segmentLength * this.despawnBehindSegments) {
        toDelete.push(name);
      }
    }

    for (const name of toDelete) {
      this.state.objects = this.state.objects.filter(obj => obj.name !== name);
      this.collidableObjects = this.collidableObjects.filter(obj => obj.name !== name);
      this.enemies.delete(name);
      console.log(`[Enemy] Despawned ${name}`);
    }
  }

  // enemy manager
  async enemyManager() {
    const currentTime = performance.now() / 1000;
    if (currentTime - this.lastEnemySpawnTime >= this.nextEnemySpawnInterval) {
      await this.spawnEnemies();
      this.lastEnemySpawnTime = currentTime;
      this.nextEnemySpawnInterval = (Math.random() * (this.maxSpawnInterval - this.minSpawnInterval)) + this.minSpawnInterval;
    }
    this.despawnEnemies();
  }

  // randomize enemy behaviors
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

  // player jump rotation trigger
  triggerJumpRotation() {
    const horizontalDir = this.Player.velocity && this.Player.velocity[0] || 1;
    const movingHorizontally = Math.abs(horizontalDir) > 0;

    this.jumpState.spinAxis = movingHorizontally ? 'z' : 'x';
    const sign = movingHorizontally ? (horizontalDir >= 0 ? -1 : 1) : 1;

    this.jumpState.spinRemaining = Math.PI / 2;
    this.jumpState.spinSpeed = Math.PI / 0.25;
    this.jumpState.spinSign = sign;
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
  
  // sphere collider creation (unused)
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

  // box collider creation
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

  // function to check if an object is colliding with collidable objects
  checkCollision(object) {
    this.collidableObjects.forEach(otherObject => {
      if (object.name === otherObject.name || !object.collider || !otherObject.collider) {
        return;
      }
      
      const a = computeAABB(object);
      const b = computeAABB(otherObject);

      const isGround = otherObject.name && otherObject.name.startsWith("PlatformSegment_");
      const isCollectible = otherObject.name && otherObject.name.startsWith("Collectible_");

      const dx = Math.abs(a.center[0] - b.center[0]);
      const dy = Math.abs(a.center[1] - b.center[1]);
      const dz = Math.abs(a.center[2] - b.center[2]);

      const overlapX = (a.half[0] + b.half[0]) - dx;
      const overlapY = (a.half[1] + b.half[1]) - dy;
      const overlapZ = (a.half[2] + b.half[2]) - dz;

      if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
        // For collectibles, just trigger the collection without physics response
        if (isCollectible) {
          if (otherObject.collider.onCollide) {
            otherObject.collider.onCollide(object);
          }
          return; // Don't do physics collision for collectibles
        }

        // Regular physics collision for non-collectibles
        if (overlapY <= overlapX && overlapY <= overlapZ) {
          if (object.velocity && object.velocity[1] < 0 && a.center[1] > b.center[1]) {
            const platformTop = b.center[1] + b.half[1];
            object.model.position[1] = platformTop + 0.25 * object.model.scale[1];
            object.velocity[1] = 0;
            object.isOnGround = true;
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
        
        // Call the object's own collision callback (for enemies, etc.)
        if (object.collider.onCollide) {
          object.collider.onCollide(otherObject);
        }
      }
    });
  }

  // runs once on startup after the scene loads the objects
  async onStart() {
    console.log("On start");

    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    }, false);

    this.score = 0;
    this.playerSpeed = 5;
    this.streak = 0;
    this.multiplier = 1;

    this.Player = getObject(this.state, "Player");
    this.initialPlayerPosition = vec3.clone(this.Player.model.position);
    this.Player.velocity = vec3.fromValues(0, 0, 0);

    this.platformY = this.Player.model.position[1] - 0.5 * this.Player.model.scale[1] - 0.01;

    // Initialize collectible spawning
    this.nextCollectibleX = this.Player.model.position[0] + 5;
    this.lastCollectibleX = this.nextCollectibleX - this.collectibleSpacing;

    this.state.canvas.tabIndex = 0;
    this.state.canvas.focus();
    window.focus();

    if (!this.Player) {
      console.error('[Platform] Player not found at start');
      return;
    }

    const initialSegmentIndex = this.Player ? Math.floor(this.Player.model.position[0] / this.segmentLength) : 0;
    await this.platformManager(initialSegmentIndex);
    await this.spawnEnemies();
    this.lastEnemySpawnTime = performance.now() / 1000;

    this.Satellite = getObject(this.state, "Satellite");

    this.CameraOffset = vec3.create();
    vec3.sub(this.CameraOffset, this.state.camera.position, this.Player.model.position);

    this.CameraModes = {
      primary: {
        offset: vec3.clone(this.CameraOffset),
        smooth: true,
        smoothFactor: 0.1,
        lockY: true,
        lookAtPlayer: true
      },
      third_person: {
        offset: vec3.fromValues(-3, 2, 1),
        smooth: true,
        smoothFactor: 0.15,
        lockY: false,
        lookAtPlayer: true
      }
    };

    this.activeCameraMode = 'primary';
    this._shiftHeld = false;

    this.createBoxCollider(this.Player, null, (otherObject) => {
      if (otherObject.name.startsWith("Enemy_")) {
        setTimeout(() => { this.resetScene(); }, 10);
        return;
      }
      console.log(`[Collision] Player collided with ${otherObject.name}`);
    });
    
    window.addEventListener("keydown", (e) => {
      const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
      if (isSpace) {
        const now = performance.now() / 1000;
        this.jumpState.lastJumpPressTime = now;
        this.jumpState.keyHeld = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
      if (isSpace) {
        this.jumpState.isJumping = false;
        this.jumpState.keyHeld = false;
      }
    });

    window.addEventListener("keydown", (e) => {
      if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !this._shiftHeld) {
        this._shiftHeld = true;
        
        if (this.activeCameraMode === 'primary') {
          this.activeCameraMode = 'third_person';
          console.log("[Camera] Switched to alt view");
        } 
        else {
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

    this.updateHUD();
  }

  // Runs once every frame non stop after the scene loads
  async onUpdate(deltaTime) {
    const gravity = -9.81;
    this.score += deltaTime * 10;

    this.updateHUD();

    // speed increase logic - much more gradual progression
    if (this.score >= 20000) {
      this.playerSpeed = 25;
    }    
    else if (this.score >= 15000 && this.score < 20000) {
      this.playerSpeed = 22;
    } 
    else if (this.score >= 12000 && this.score < 15000) {
      this.playerSpeed = 19;
    }
    else if (this.score >= 10000 && this.score < 12000) {
      this.playerSpeed = 17;
    }
    else if (this.score >= 8000 && this.score < 10000) {
      this.playerSpeed = 15;
    }
    else if (this.score >= 6000 && this.score < 8000) {
      this.playerSpeed = 13;
    }
    else if (this.score >= 4500 && this.score < 6000) {
      this.playerSpeed = 11;
    }
    else if (this.score >= 3000 && this.score < 4500) {
      this.playerSpeed = 9;
    }
    else if (this.score >= 1500 && this.score < 3000) {
      this.playerSpeed = 7;
    }
    else if (this.score >= 500 && this.score < 1500) {
      this.playerSpeed = 6;
    }

    const prevY = this.Player.model.position[1];
    this.Player.translate(vec3.fromValues(this.playerSpeed * deltaTime, 0, 0));

    this.Player.velocity[1] += gravity * deltaTime;
    if (this.Player.velocity[1] < -50) {
      this.Player.velocity[1] = -50;
    }

    const currentTime = performance.now() / 1000;
    const jumpCFG = this.jumpConfig;
    const jumpST = this.jumpState;

    this.Player.isOnGround = false;

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

      if (!onGround && !isCoyote) {
        jumpST.usedDoubleJump = true;
      }

      const maxRotations = jumpCFG.allowDoubleJump ? 2 : 1;
      if (jumpST.rotationCount < maxRotations) {
        this.triggerJumpRotation();
        jumpST.rotationCount += 1;
      }
      jumpST.lastJumpPressTime = -999;
    }

    if (!this.Player.isOnGround && this.jumpState.spinRemaining > 0) {
      const step = Math.min(this.jumpState.spinSpeed * deltaTime, this.jumpState.spinRemaining);
      const axis = this.jumpState.spinAxis;
      const signedStep = step * (this.jumpState.spinSign || 1);
      this.Player.rotate(axis, signedStep);
      this.jumpState.spinRemaining -= step;
    }

    if (jumpST.isJumping) {
      const holdTime = currentTime - jumpST.jumpStartTime;
      const canHold = (jumpST.lastJumpPressTime === -999) ? true : (currentTime - jumpST.lastJumpPressTime) <= jumpCFG.maxHoldBoostTime;
      if (canHold && holdTime <= jumpCFG.maxHoldBoostTime && this.Player.velocity[1] > 0) {
        this.Player.velocity[1] += jumpCFG.holdBoostStrength * deltaTime;
      } else {
        jumpST.isJumping = false;
      }
    }

    this.Player.translate(vec3.fromValues(0, this.Player.velocity[1] * deltaTime, 0));

    {
      const playerBottomPrev = prevY + this.Player.centroid[1] - 0.25 * this.Player.model.scale[1];
      const playerBottomNow  = this.Player.model.position[1] + this.Player.centroid[1] - 0.25 * this.Player.model.scale[1];
      let landed = false;
      const candidates = [];

      for (const segment of this.platformSegments.values()) {
        const pAABB = computeAABB(segment);
        const playerAABB = computeAABB(this.Player);

        const overlapX = (pAABB.half[0] + playerAABB.half[0]) - Math.abs(pAABB.center[0] - playerAABB.center[0]);
        const overlapZ = (pAABB.half[2] + playerAABB.half[2]) - Math.abs(pAABB.center[2] - playerAABB.center[2]);
        if (overlapX <= 0 || overlapZ <= 0) continue;

        const platformTop = pAABB.center[1] + pAABB.half[1];
        const crossedDownThroughTop = playerBottomPrev >= platformTop && playerBottomNow <= platformTop;
        if (crossedDownThroughTop && this.Player.velocity[1] <= 0) {
          candidates.push({ pAABB, platformTop, overlapX});
        }
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

        this.Player.model.position[1] = best.platformTop + 0.05 * this.Player.model.scale[1];
        this.Player.velocity[1] = 0;
        this.Player.isOnGround = true;
        this.jumpState.rotationCount = 0;
        this.jumpState.spinRemaining = 0;
        this.jumpState.lastGroundTime = currentTime;
        this.jumpState.usedDoubleJump = false;
        this.jumpState.isJumping = false;
        landed = true;
      }
    }

    if (this.Satellite && this.Satellite.rotate) {
      this.Satellite.rotate('z', deltaTime * 0.2);
    }

    this.checkCollision(this.Player);

    if (this.Player) {
      const mode = this.CameraModes[this.activeCameraMode];
      
      const desiredPosition = vec3.create();
      vec3.add(desiredPosition, this.Player.model.position, mode.offset);
      
      if (mode.smooth) {
        const delta = vec3.create();
        vec3.sub(delta, desiredPosition, this.state.camera.position);
        vec3.scale(delta, delta, mode.smoothFactor);
        vec3.add(this.state.camera.position, this.state.camera.position, delta);
      } else {
        vec3.copy(this.state.camera.position, desiredPosition);
      }
      
      if (mode.lockY) {
        this.state.camera.position[1] = desiredPosition[1];
      }
      
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
    
    // Manage collectibles
    await this.manageCollectibles();
    this.updateCollectibles(deltaTime, currentTime);
  }
}