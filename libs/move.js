import * as THREE from 'three';


class CurveFunction {

    constructor(func){
	this.func = func;
    }

    getTangentAt(point){
        var p0, p1;
        if (point < 0.001){
            p1 = this.getPointAt(point+0.001);
	    p0 = this.getPointAt(point);
        } else {
            p1 = this.getPointAt(point);
	    p0 = this.getPointAt(point-0.001);
        }
	return p1.sub(p0);
    }

    getPointAt(point){
	return this.func(point);
    }

    getSpacedPoints(divisions){
        const pointArray = [];
        for (let i=0; i<=divisions; i++){
	    pointArray[i] = this.getPointAt(i/divisions);
        }
        return pointArray;
    }


    getLineObject(divisions, color=0xff0000){
        const geometry = new THREE.BufferGeometry().setFromPoints( this.getSpacedPoints(divisions) );
        const material = new THREE.LineBasicMaterial( { color: color } );

        // Create the final object
        return new THREE.Line( geometry, material );
    }
    
    getPointsObject(divisions, color=0xff0000){
        const geometry = new THREE.BufferGeometry().setFromPoints( this.getSpacedPoints(divisions) );
        const material = new THREE.PointsMaterial( { size: 0.05, color: color } );

        // Create the final object
        return new THREE.Points( geometry, material );
    }


}

const _vZero = /*@__PURE__*/ new THREE.Vector3(0,0,0);
const _m1 = /*@__PURE__*/ new THREE.Matrix4();
const _euler = /*@__PURE__*/ new THREE.Euler();
const _q1 = /*@__PURE__*/ new THREE.Quaternion();

class MOVE {

    static allMoves = [];
    static update(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.updateMove();
	})
    }	
    
    static reset(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.reset();
	})
    }	

    static stop(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.stop();
	})
    }	

    static start(startTime=0){
	MOVE.allMoves.forEach( (obj) => {
	    obj.start(startTime);
	})
    }	

    constructor(obj, absoluteStartTime=false, log=false, onEnd = null){
	this.obj = obj;
	this.clock = new THREE.Clock(false);
	this.moveQueue = [];
	this.curMove = 0;
	this.absoluteStartTime = absoluteStartTime;
	this.onEnd = onEnd;
	this.log = log;
	this.objTiltAngleBuffer = [];
	if (this.log && typeof this.log !== 'string' && !(this.log instanceof String))
	    this.log = obj.constructor.name;
	MOVE.allMoves.push(this);
    }

    // Release the move object from the allMoves list
    release(){
        MOVE.allMoves = MOVE.allMoves.filter(item => item !== this);
    }
    
    
    // Get absolute end time of move back in the queue
    getMoveEndTime(movesBack=0){
	var endTime = 0;
	if (this.moveQueue.length > movesBack){
	    const prevMove = this.moveQueue[this.moveQueue.length-1-movesBack];
	    endTime = prevMove.endTime;
	}
	return endTime;
    }

    // Get absolute start time of move back in the queue
    getMoveStartTime(movesBack=0){
	var startTime = 0;
	if (this.moveQueue.length > movesBack){
	    const prevMove = this.moveQueue[this.moveQueue.length-1-movesBack];
	    startTime = prevMove.startTime;
	}
	return startTime;
    }

    run(func, startTime=0){
	var startAfter;
	var endTime;
	if (this.absoluteStartTime){
	    startAfter = startTime-this.getMoveEndTime();
	    endTime = startTime;
	    if (startAfter < 0)
		console.error("run scheduled in past by " + startAfter + " seconds");
	} else {
	    startAfter = startTime;
	    startTime = this.getMoveEndTime() + startAfter;
	    endTime = startTime;
	}
	this.moveQueue.push({
	    startAfter: startAfter,
	    startTime: startTime,
	    endTime: endTime,
	    run: func
	}) 
	return this;
    }

    loop(nrMoves, loopCnt=0, startTime=0){
	var startAfter;
	if (this.absoluteStartTime){
	    startAfter = startTime-this.getMoveEndTime();
	    if (startAfter < 0)
		console.error("loop scheduled in past by " + startAfter + " seconds");
	} else {
	    startAfter = startTime;
	    startTime = this.getMoveEndTime() + startAfter;
	}
	const loopTime = (startTime - this.getMoveEndTime(nrMoves))*loopCnt;
	const endTime = startTime + loopTime;
	this.moveQueue.push({
	    startAfter: startAfter,
	    startTime: startTime,
	    endTime: endTime,
	    loop: nrMoves,
	    loopCnt: loopCnt,
	    curLoopCnt: 0
	}) 

	return this;
    }

    start(from_time=null){
	this.clock.start();
	if (from_time)
	    this.clock.elapsedTime = from_time;
	if (this.log)
	    console.log(this.log + ": Time " + this.clock.elapsedTime + " Move started");
	return this;
    }
    
    stop(){
	if (this.log)
	    console.log(this.log + ": Time " + this.clock.elapsedTime + " Move stopped");
	this.clock.stop();
	return this;
    }

    reset(){
	this.moveQueue = [];
	this.curMove = 0;
	this.clock.stop();
	return this;
    }


    limitRotationSpeed(targetDirection, curDirection, maxRotationSpeed, timeSinceLastUpdate){
        const angleFromCur = curDirection.angleTo(targetDirection);
        
	// Check if we need to limit
	const limit = angleFromCur > (maxRotationSpeed/30);

	if (limit){
	    // Find time since last rotation
	    if (timeSinceLastUpdate == 0.0)
	        timeSinceLastUpdate = 1/30;
	    // Assuming a catch up speed of pi/4 radians/s unless we have explicitly given
	    // the catchup speed to the to() command
	    const catchUpTime = angleFromCur/maxRotationSpeed;
            // If we are within the speed limit then do nothing
	    if (timeSinceLastUpdate < catchUpTime){
		const deltaAngle = (timeSinceLastUpdate/catchUpTime)*angleFromCur;
		// Get the normal vector to the plane that current and target direction
		// vectors lie in and use as a rotation axis
		const rotationAxis = curDirection.clone().cross(targetDirection);
		const newDirVector = curDirection.applyAxisAngle(rotationAxis.normalize(), deltaAngle);
		return newDirVector;
	    } 
	} 
        return targetDirection;
    }
    
    getRotationAngleCurve(curve, point, tilt=false, roll=false, maxRotationSpeed=null, timeSinceLastUpdate=0, tiltOffset=0, rollSpeed=1){
        var tangent;
	if (curve instanceof THREE.Curve || curve instanceof CurveFunction ){
	    tangent = curve.getTangentAt(point);
	    this.objPrevTangent = this.objPrevTangent || curve.getTangentAt(0);
        } else {
            tangent = this.obj.position.clone().sub(this.prevPos).normalize();
	    this.objPrevTangent = this.objPrevTangent || tangent;
        }
        
        tangent.lerpVectors(this.objPrevTangent, tangent, 0.5);
        if (maxRotationSpeed)
            tangent=this.limitRotationSpeed(tangent, this.objPrevTangent, maxRotationSpeed, timeSinceLastUpdate);
        tangent.normalize();
        const objPrevTangent = this.objPrevTangent.clone();
        this.objPrevTangent = tangent;
	var up = this.obj.up;
	if (tilt){
            tangent.y=0;
            objPrevTangent.y=0;
            const tangentCross = objPrevTangent.clone().cross(tangent);
	    const rotateLeft = tangentCross.y > 0;

	    const tangentDeltaAngle = objPrevTangent.angleTo(tangent);
	    this.objTiltAngleBuffer.push(10*(rotateLeft ? Math.abs(tangentDeltaAngle) : -Math.abs(tangentDeltaAngle)));
	    if (this.objTiltAngleBuffer.length > 10)
		this.objTiltAngleBuffer.shift();
	    var objTiltAngle = this.objTiltAngleBuffer.reduce(
		(accumulator, currentValue, i) => accumulator + currentValue/this.objTiltAngleBuffer.length,
		0);

            objTiltAngle += tiltOffset;
	    objTiltAngle = Math.max(-Math.PI/4, Math.min(objTiltAngle, Math.PI/4));
            // Tilt the up vector by rotating around the tangent axis
	    up = up.clone().applyAxisAngle(tangent.clone().negate(), objTiltAngle);
	} else if(roll){
            this.rollAngle = this.rollAngle != null ? this.rollAngle + timeSinceLastUpdate*rollSpeed : 0; 
	    up = up.clone().applyAxisAngle(tangent.clone().negate(), this.rollAngle);
        }

	
	// If this is a camera object then the view direction
	// is in the opposite direction of the object direction
	// so flip the tangen vector to get it to follow the view
	// direction
	if (this.obj.isCamera || this.obj.isLight){
	    _m1.lookAt(_vZero, tangent, up);
	} else {
	    _m1.lookAt(tangent, _vZero, up);
	}

        const rotation = new THREE.Vector3().setFromEuler(_euler.setFromRotationMatrix(_m1, "XYZ"));

	return rotation
    }


    static NO_CHANGE = 1;
    static ROTATE_TO_TANGENT = 2;
    static ROTATE_TO_TANGENT_AND_TILT = 3;
    static ROTATE_TO_TANGENT_AND_ROLL = 4;

    static CATCH_UP_LINEAR = -1;

    getCurPosFromQueue(){
	if (this.moveQueue.length>0){
	    var lookback_idx = 0;
	    var queueElmt;
	    do {
		lookback_idx++;
		if (lookback_idx<=this.moveQueue.length)
		    queueElmt = this.moveQueue[this.moveQueue.length-lookback_idx];
		else
		    queueElmt = null;
	    } while (queueElmt && ((queueElmt.pathCurve && queueElmt.pathCurve == MOVE.NO_CHANGE) || queueElmt.loop || queueElmt.run ));

	    if (queueElmt){
		if (queueElmt.pathCurve instanceof THREE.Curve || queueElmt.pathCurve instanceof CurveFunction )
		    return queueElmt.pathCurve.getPointAt(1.0);
		else if (!queueElmt.pathCurve)
		    return null;
	    }
	} 

	// No other move in queue so take the current position/rotation
	return this.obj.position.clone();
    }
    
    getCurRotationFromQueue(){
	if (this.moveQueue.length>0){
	    var lookback_idx = 0;
	    var queueElmt;
	    do {
		lookback_idx++;
		if (lookback_idx<=this.moveQueue.length)
		    queueElmt = this.moveQueue[this.moveQueue.length-lookback_idx];
		else
		    queueElmt = null;
	    } while (queueElmt && ((queueElmt.rotationCurve && queueElmt.rotationCurve == MOVE.NO_CHANGE) || queueElmt.loop || queueElmt.run));

	    if (queueElmt){
		if (queueElmt.rotationCurve && queueElmt.rotationCurve.isObject3D || queueElmt.rotationCurve instanceof THREE.Vector3)
		    return queueElmt.rotationCurve;
		else if (queueElmt.rotationCurve == MOVE.ROTATE_TO_TANGENT && (queueElmt.pathCurve instanceof THREE.Curve || queueElmt.pathCurve instanceof CurveFunction) )
		    return this.getRotationAngleCurve(queueElmt.pathCurve, 1.0);
		else if (queueElmt.rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_TILT && (queueElmt.pathCurve instanceof THREE.Curve || queueElmt.pathCurve instanceof CurveFunction) )
		    return this.getRotationAngleCurve(queueElmt.pathCurve, 1.0, true);
		else if (queueElmt.rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_ROLL && (queueElmt.pathCurve instanceof THREE.Curve || queueElmt.pathCurve instanceof CurveFunction) )
		    return this.getRotationAngleCurve(queueElmt.pathCurve, 1.0, false, true);
		else if (queueElmt.rotationCurve && (queueElmt.rotationCurve instanceof THREE.Curve || queueElmt.rotationCurve instanceof CurveFunction))
		    return queueElmt.rotationCurve.getPointAt(1.0);
		else
		    return null;
	    }
	} 

	// No other move in queue so take the current rotation
	return new THREE.Vector3().setFromEuler(this.obj.rotation);
    }

    to(pos, rotation=null, time=0, startTime=0, easing=null, posCatchUpSpeed=null, rotationCatchUpSpeed=null, tiltOffset=0, useLookAtObjUp=false, rollSpeed=1){
	var pathCurve, rotationCurve;
	const fromPos = this.getCurPosFromQueue();
	const fromRotation = this.getCurRotationFromQueue(); 

	if (pos){
	    if (pos.constructor === Array){
		pos.unshift(fromPos);
		pathCurve = new THREE.CatmullRomCurve3(pos);
	    } else if (pos instanceof THREE.Vector3 && !fromPos.isObject3D) {
		pathCurve = new THREE.LineCurve3(fromPos, pos);
	    } else if (pos == MOVE.NO_CHANGE && !fromPos.isObject3D){
		pathCurve = new THREE.LineCurve3(fromPos, fromPos);
	    } else {
		pathCurve = pos;
	    }
	} else {
	    pathCurve = null;
	}
	
	if (rotation){
	    if (rotation.constructor === Array){
		rotation.unshift(fromRotation);
		rotationCurve = new THREE.CatmullRomCurve3(rotation);
	    } else if (rotation instanceof THREE.Vector3 && fromRotation && !fromRotation.isObject3D) {
		rotationCurve = new THREE.LineCurve3(fromRotation, rotation);
	    } else if (rotation == MOVE.NO_CHANGE && fromRotation && !fromRotation.isObject3D){
		rotationCurve = new THREE.LineCurve3(fromRotation, fromRotation);
	    } else {
		rotationCurve = rotation;
	    }
	} else {
	    rotationCurve = null;
	}

	var startAfter;
        const prevMoveEndTime = this.getMoveEndTime();
	if (this.absoluteStartTime){
            // We allow time to be null if absolute time is used
            // In that case we set the endTime to the startTime of the next to() call
            if (prevMoveEndTime == null){
                startAfter = 0;
                this.moveQueue[this.moveQueue.length-1].endTime = startTime;
                this.moveQueue[this.moveQueue.length-1].toTime = startTime - this.moveQueue[this.moveQueue.length-1].startTime;
            } else {
	        startAfter = startTime-this.getMoveEndTime();
            }
	    if (startAfter < 0)
		console.error("MOVE.to() scheduled in past by " + startAfter + " seconds");
	} else {
            console.assert(prevMoveEndTime != null);
	    startAfter = startTime;
	    startTime = this.getMoveEndTime() + startAfter;
	}
	const endTime = time != null ? startTime + time : null;
	this.moveQueue.push({
	    startAfter: startAfter,
	    toTime: time,
	    startTime: startTime,
	    endTime: endTime,
	    easing: easing,
	    pathCurve: pathCurve,
	    posCatchUpSpeed: posCatchUpSpeed,
	    rotationCatchUpSpeed: rotationCatchUpSpeed,
	    rotationCurve: rotationCurve,
	    prevPosObject: fromPos,
	    prevLookAtObject: fromRotation,
            tiltOffset: tiltOffset,
            useLookAtObjUp: useLookAtObjUp,
            rollSpeed: rollSpeed
	})

	return this
    }

    lookAt(pos, up=this.obj.up){
	const parent = this.obj.parent;
	this.obj.updateWorldMatrix( true, false );
	const worldPos = pos.clone().setFromMatrixPosition( this.obj.matrixWorld );

	if ( this.obj.isCamera || this.obj.isLight ) {
	    _m1.lookAt(worldPos, pos, up );
	} else {
	    _m1.lookAt(pos, worldPos, up );
	}

	this.obj.quaternion.setFromRotationMatrix( _m1 );

	if ( parent ) {
	    _m1.extractRotation( parent.matrixWorld );
	    _q1.setFromRotationMatrix( _m1 );
	    this.obj.quaternion.premultiply( _q1.invert() );
	}
    }

    
    updateMove(){
	// If no move is running just exit
	if (!this.clock.running || this.curMove >= this.moveQueue.length){
	    return;
	}

	// Get current move
	const nextMove = this.moveQueue[this.curMove];

	// Get elapsed time
	var time = this.clock.getElapsedTime();

	// Check if we are still waiting for the move to start
	var newMoveStarted = false;
	if (!nextMove.started){
	    if (time >= nextMove.startTime){
		nextMove.started = true;
		newMoveStarted = true;
                this.prevTime = null;
		// We should start move now
		if (this.log)
		    console.log(this.log + ": Time " + time + " Move " + this.curMove + " started");
	    } else {
		return;
	    }
	}

	// If this is a run then do the run and then stop
	if (nextMove.run){
	    nextMove.run(this.obj);
	} else if (nextMove.loop){
	    if (nextMove.loopCnt == 0 || nextMove.curLoopCnt < nextMove.loopCnt){
		// Loop by rewinding the given number of moves
		nextMove.curLoopCnt++;
		this.curMove -= nextMove.loop;
		const loopTime = nextMove.startTime - this.moveQueue[this.curMove].startTime;
		for (let i=0; i<nextMove.loop+1; i++){
		    const move = this.moveQueue[this.curMove+i];
		    move.startTime += loopTime;
		    move.endTime += loopTime;
		}
		if (this.log)
		    console.log(this.log + ": Time " + this.clock.getElapsedTime() + " New Loop Iteration - Move " + this.curMove + " started");
		return
	    } else {
		// Done with the loop so contineu to next move
		nextMove.curLoopCnt=0;
	    }
	} else {
	    // Check move progress and apply easing
            var progress = 0;
            if (nextMove.toTime != null){
	        var progress = Math.min(time-nextMove.startTime,nextMove.toTime)/nextMove.toTime;
	        if (nextMove.easing){
		    progress = nextMove.easing(progress);
	        }
            }

            // Check current position
            const curPos = this.obj.position.clone();
            
	    // Change position and rotation
	    var pathCurve = nextMove.pathCurve;
            if (pathCurve && pathCurve.value)
                pathCurve = pathCurve.value;
            
	    if (pathCurve){
		if (pathCurve.isObject3D || pathCurve instanceof THREE.Curve || pathCurve instanceof CurveFunction ){
                    if (newMoveStarted)
                        nextMove.startPos = this.obj.position.clone();
                    const posCatchUpSpeed = nextMove.posCatchUpSpeed || 0.5;
		    const fromPos = this.obj.position;
                    var toPos;
                    if (pathCurve.isObject3D)
		        toPos = pathCurve.getWorldPosition(new THREE.Vector3());
                    else
                        toPos = pathCurve.getPointAt(progress);
                    if (posCatchUpSpeed == MOVE.CATCH_UP_LINEAR)
		        toPos = nextMove.startPos.clone().lerp(toPos, progress);
                    else
		        toPos = fromPos.clone().lerp(toPos, posCatchUpSpeed);
		    this.obj.position.copy(toPos);
		} else {
		    if (newMoveStarted && nextMove.prevPosObject && nextMove.prevPosObject.isObject3D){
			const fromPos = this.obj.position;
			if (pathCurve instanceof THREE.CatmullRomCurve3){
			    const pathPoints = pathCurve.points;
			    pathPoints[0] = fromPos;
			    pathCurve = new THREE.CatmullRomCurve3(pathPoints);
			} else if (pathCurve instanceof THREE.Vector3){
			    pathCurve = new THREE.LineCurve3(fromPos, pathCurve);
			} else if (pathCurve == MOVE.NO_CHANGE){
			    pathCurve = new THREE.LineCurve3(fromPos, fromPos);
			}
			nextMove.pathCurve = pathCurve;
		    }
		    this.obj.position.copy(pathCurve.getPointAt(progress));
		}
	    }
	    
	    var rotationCurve = nextMove.rotationCurve;
            if (rotationCurve && rotationCurve.value)
                rotationCurve = rotationCurve.value;
            
	    if (rotationCurve){
		if (rotationCurve.isObject3D || typeof rotationCurve === 'function'){
		    // If roateCurve is a 3D Object then we rotate to face that
		    const objPos = new THREE.Vector3();

		    // Get position of object to rotate towards depending on the
		    // type of the object
		    if (typeof rotationCurve === 'function')
			rotationCurve(objPos);
		    else if (rotationCurve.isMorphCloud)
		    	objPos.copy(rotationCurve.getCurrentMorphCenter());
		    else
		 	rotationCurve.getWorldPosition(objPos);

		    // Make a direction vector to the target and to a point the
		    // current rotation is pointed at 
		    const targetDirVector = objPos.clone().sub(this.obj.position);
		    const curDirVector = new THREE.Vector3();
		    this.obj.getWorldDirection(curDirVector);

		    // Check if we need to catch up
		    const catchUpSpeed = nextMove.rotationCatchUpSpeed || Math.PI/4;
		    if (newMoveStarted || nextMove.catchingUp){
			// Find time since last rotation
			const timeSinceLastRotation = this.prevTime || nextMove.startTime;
			// Assuming a catch up speed of pi/4 radians/s unless we have explicitly given
			// the catchup speed to the to() command
			const deltaTime = time-timeSinceLastRotation;
			if (deltaTime == 0.0)
			    deltaTime = 1/30;
                        // Limit rotation
                        const newTargetDirVector = this.limitRotationSpeed(targetDirVector, curDirVector, catchUpSpeed, deltaTime);
                        // Check if rotation was limited
                        if (!newTargetDirVector.equals(targetDirVector)){
                            objPos.copy(this.obj.position).add(newTargetDirVector);
                            nextMove.catchingUp = true;
                        } else {
			    nextMove.catchingUp = false;
                        }
		    }
                    this.objPrevTangent = objPos.clone().sub(curPos).normalize();
		    this.lookAt(objPos, rotationCurve.isObject3D && nextMove.useLookAtObjUp ? rotationCurve.up : this.obj.up);
		} else if (rotationCurve == MOVE.ROTATE_TO_TANGENT || rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_TILT || rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_ROLL){
		    // Find time since last rotation
		    const timeSinceLastRotation = this.prevTime || nextMove.startTime;
		    // Assuming a catch up speed of pi/4 radians/s unless we have explicitly given
		    // the catchup speed to the to() command
		    const deltaTime = time-timeSinceLastRotation;
		    if (deltaTime == 0.0)
			deltaTime = 1/30;
		    this.obj.rotation.setFromVector3(this.getRotationAngleCurve(nextMove.pathCurve, progress, rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_TILT,
                                                                                rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_ROLL, nextMove.rotationCatchUpSpeed, deltaTime, nextMove.tiltOffset, nextMove.rollSpeed));
		} else {
		    if (newMoveStarted && nextMove.prevLookAtObject && nextMove.prevLookAtObject.isObject3D){
			const fromRotation = new THREE.Vector3().setFromEuler(this.obj.rotation);
			if (rotationCurve instanceof THREE.CatmullRomCurve3){
			    const pathPoints = rotationCurve.points;
			    pathPoints[0] = fromRotation;
			    rotationCurve = new THREE.CatmullRomCurve3(pathPoints);
			} else if (rotationCurve instanceof THREE.Vector3){
			    rotationCurve = new THREE.LineCurve3(fromRotation, rotationCurve);
			} else if (rotationCurve == MOVE.NO_CHANGE){
			    rotationCurve = new THREE.LineCurve3(fromRotation, fromRotation);
			}
			nextMove.rotationCurve = rotationCurve;
		    }

                    this.objPrevTangent = null;
		    if (rotationCurve){
                        var toRotation = rotationCurve.getPointAt(progress);
                        if (nextMove.rotationCatchUpSpeed){
                            const curRotation = new THREE.Vector3().setFromEuler(this.obj.rotation);
                            toRotation = curRotation.clone().lerp(toRotation, nextMove.rotationCatchUpSpeed);                        
                        } 
                        // Should possibly flip sign of z-component if not camera or light?
                        this.objPrevTangent = new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler().setFromVector3(toRotation));
			this.obj.rotation.setFromVector3(toRotation);
                    }
		}
	    }
	    this.prevTime = time;
            this.prevPos = curPos;
            
	    // Check if move is done - use toTime is not null - if null then use startTime of next move
            var toTime;
            if (nextMove.toTime != null)
                toTime = nextMove.toTime
            else
                toTime = this.moveQueue[this.curMove+1].startTime;

	    if ((time-nextMove.startTime)<toTime)
		// Not done yet
		return;
	}
	
	// Move to next move if we have more moves
	nextMove.started=false;
	if (this.moveQueue.length > this.curMove+1){
	    this.curMove++;
	    //if (this.log)
	    //	console.log(this.log + ": Time " + this.clock.getElapsedTime() + " Waiting for move " + this.curMove);
	} else {
	    this.clock.stop();
	    if (this.onEnd)
		this.onEnd(this);
	}	
    }	
}

export {MOVE, CurveFunction};
