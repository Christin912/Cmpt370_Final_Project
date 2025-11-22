class Game {
  constructor(state) {
    this.state = state;
    this.spawnedObjects = [];
    this.collidableObjects = [];
    this.jumpConfig = {
      jumpStrength: 7,
      holdBoostStrength: 0.3,
      maxHoldBoostTime: 0.2,
      coyoteTime: 0.15,
      jumpBufferTime: 0.15,
      allowDoubleJump: true
    };
    this.jumpState = { 
      lastGroundTime: 0,
      lastJumpPressTime: -999,
      jumpStartTime: 0,
      usedDoubleJump: false,
      isJumping: false
    };
  }

  // example - we can add our own custom method to our game and call it using 'this.customMethod()'
  customMethod() {
    console.log("Custom method!");
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
            const playerHalf = a.half[1];
            object.model.position[1] = platformTop + playerHalf; // snap
            object.velocity[1] = 0; // reset vertical velocity on Y collision
            object.isOnGround = true; // set on ground flag
            this.jumpState.lastGroundTime = performance.now() / 1000;
            this.jumpState.usedDoubleJump = false;
            this.jumpState.isJumping = false;
          } else {
            const dir = (a.center[1] < b.center[1]) ? -1 : 1;
            object.model.position[1] += dir * overlapY;
            if (dir === 1 && object.velocity) {
              object.velocity[1] = 0;
              object.isOnGround = true;
              this.jumpState.lastGroundTime = performance.now() / 1000;
              this.jumpState.usedDoubleJump = false;
              this.jumpState.isJumping = false;
            }
          }
        } else if (overlapX <= overlapZ) {
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
      

      /*
      if (
        Math.abs(a[0] - b[0]) <= (aDim[0] / 2 + bDim[0] / 2) &&
        Math.abs(a[1] - b[1]) <= (aDim[1] / 2 + bDim[1] / 2) &&
        Math.abs(a[2] - b[2]) <= (aDim[2] / 2 + bDim[2] / 2)
      ) {
        if (object.collider.onCollide) {
          object.collider.onCollide(otherObject);
        }
        const overlapX = (aDim[0] / 2 + bDim[0] / 2) - Math.abs(a[0] - b[0]);
        const overlapY = (aDim[1] / 2 + bDim[1] / 2) - Math.abs(a[1] - b[1]);
        const overlapZ = (aDim[2] / 2 + bDim[2] / 2) - Math.abs(a[2] - b[2]);

        if (overlapX < overlapY && overlapX < overlapZ) {
          object.model.position[0] += (a[0] < b[0] ? -overlapX : overlapX);
        } else if (overlapY < overlapX && overlapY < overlapZ) {
          object.model.position[1] += (a[1] < b[1] ? -overlapY : overlapY);
          object.velocity[1] = 0; // reset vertical velocity on Y collision
          object.isOnGround = true; // set on ground flag
          console.log("Landed");
        } else {
          object.model.position[2] += (a[2] < b[2] ? -overlapZ : overlapZ);
        }
      }*/
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

    // example - set an object in onStart before starting our render loop!
    this.Player = getObject(this.state, "Player");
    this.Player.velocity = vec3.fromValues(0, 0, 0); // custom property
    const Platform = getObject(this.state, "Platform"); // we wont save this as instance var since we dont plan on using it in update
    const gap = 10; // vertical space
    if (Platform && this.Player) {
      const platformTop = Platform.model.position[1] + 0.25 * Platform.model.scale[1];
      const playerHalf = 0.25 * this.Player.model.scale[1];
      this.Player.model.position[1] = platformTop + playerHalf + gap;
    }

    this.Satellite = getObject(this.state, "Satellite");

    this.CameraOffset = vec3.create();
    vec3.sub(this.CameraOffset, this.state.camera.position, this.Player.model.position);

    this.cameraFollow = {
      enabled: true,
      smooth: true,
      smoothFactor: 0.15,
      lockY: true,
      lookAtPlayer: true
    };

    // example - create sphere colliders on our two objects as an example, we give 2 objects colliders otherwise
    // no collision can happen
    this.createBoxCollider(this.Player, null, (otherObject) => {
      console.log(`This is a custom collision of ${otherObject.name}`)
    });
    if (Platform)
      this.createBoxCollider(Platform);


    document.addEventListener("keydown", (e) => {
      e.preventDefault();
      if (e.code === "Space") {
        this.jumpState.lastJumpPressTime = performance.now() / 1000;
      }
    });

    document.addEventListener("keyup", (e) => {
      e.preventDefault();
      if (e.code === "Space") {
        this.jumpState.isJumping = false; // stop hold boost
      }
    });

    this.customMethod(); // calling our custom method! (we could put spawning logic, collision logic etc in there ;) )

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
  onUpdate(deltaTime) {
    // TODO - Here we can add game logic, like moving game objects, detecting collisions, you name it. Examples of functions can be found in sceneFunctions.
    const speed = 2;
    const gravity = -9.81;
    
    const prevY = this.Player.model.position[1];
    this.Player.translate(vec3.fromValues(speed * deltaTime, 0, 0)); // move player along x-axis

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
      if (!onGround && !isCoyote) {
        jumpST.usedDoubleJump = true; // mark double jump as used
      }

      jumpST.lastJumpPressTime = -999; // reset jump press time to avoid double triggering
    }

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

    const platform = getObject(this.state, "Platform");
    if (platform) {
      const pAABB = computeAABB(platform);
      const playerAABB = computeAABB(this.Player);

      const platformTop = pAABB.center[1] + pAABB.half[1];
      const playerBottomPrev = prevY + this.Player.centroid[1] - 0.25 * this.Player.model.scale[1];
      const playerBottomNow  = this.Player.model.position[1] + this.Player.centroid[1] - 0.25 * this.Player.model.scale[1];

      const horizontallyOverlapping = Math.abs(pAABB.center[0] - playerAABB.center[0]) <= (pAABB.half[0] + playerAABB.half[0]) &&
                                      Math.abs(pAABB.center[2] - playerAABB.center[2]) <= (pAABB.half[2] + playerAABB.half[2]);

      const crossedDownThroughTop = playerBottomPrev >= platformTop && playerBottomNow <= platformTop;

      if (horizontallyOverlapping && crossedDownThroughTop) {
        this.Player.model.position[1] = platformTop + 0.25 * this.Player.model.scale[1]; // snap to top of platform
        this.Player.velocity[1] = 0; // reset vertical velocity
        this.Player.isOnGround = true; // set on ground flag
      }
    }

    this.Satellite.rotate('z', deltaTime * 0.2); // rotate the satellite slowly
  
    this.checkCollision(this.Player); // check for collisions on the player every frame

    if (this.cameraFollow && this.Player) {
      const desiredPosition = vec3.create();
      vec3.add(desiredPosition, this.Player.model.position, this.CameraOffset);

      if (this.cameraFollow.smooth) {
        const delta = vec3.create();
        vec3.sub(delta, desiredPosition, this.state.camera.position);
        vec3.scale(delta, delta, this.cameraFollow.smoothFactor);
        vec3.add(this.state.camera.position, this.state.camera.position, delta);
      } else {
        vec3.copy(this.state.camera.position, desiredPosition);
      }

      if (this.cameraFollow.lockY) {
        this.state.camera.position[1] = desiredPosition[1];
      }

      if (this.cameraFollow.lookAtPlayer) {
        const toPlayer = vec3.create();
        vec3.sub(toPlayer, this.Player.model.position, this.state.camera.position);
        vec3.normalize(toPlayer, toPlayer);
        vec3.copy(this.state.camera.front, toPlayer);
      }
    }

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
