import * as THREE from 'three';

class MOVE {

    static allMoves = [];
    static update(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.updateMove();
	})
    }	
    
    constructor(obj, log=false){
	this.obj = obj;
	this.clock = new THREE.Clock(false);
	this.moveQueue = [];
	this.curMove = 0;
	this.log = log;
	MOVE.allMoves.push(this);
    }

    run(func, startAfter=0){
	this.moveQueue.push({
	    startAfter: startAfter,
	    run: func
	}) 
	return this;
    }

    loop(nrMoves, loopCnt=0, startAfter=0){
	this.moveQueue.push({
	    startAfter: startAfter,
	    loop: nrMoves,
	    loopCnt: loopCnt,
	    curLoopCnt: 0
	}) 

	return this;
    }

    start(){
	this.clock.start();
	if (this.log)
	    console.log("Time " + this.clock.elapsedTime + " Move started");
	return this;
    }
    
    stop(){
	if (this.log)
	    console.log("Time " + this.clock.elapsedTime + " Move stopped");
	this.clock.stop();
	return this;
    }

    getRotationAngleCurve(curve, point){
	const tangent = curve.getTangentAt(point);
	// If this is a camera object then the view direction
	// is in the opposite direction of the object direction
	// so flip the tangen vector to get it to follow the view
	// direction
	if (this.obj.isCamera){
	    tangent.negate();
	}
	// Angle around x-axis where 0 means y==0
	// and z is positive
	const angle_x = Math.atan2(-tangent.y,Math.abs(tangent.z));
	// Angle around y-axis where 0 means x==0
	// and z is positive
	const angle_y = Math.atan2(tangent.x,tangent.z);
	return new THREE.Vector3(angle_x, angle_y, 0);
    }


    static NO_CHANGE = 1;
    static ROTATE_TO_TANGENT = 2;

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
	    } while (queueElmt && ((queueElmt.pathCurve && queueElmt.pathCurve == MOVE.NO_CHANGE) || queueElmt.loop));

	    if (queueElmt){
		if (queueElmt.pathCurve instanceof THREE.Curve)
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
	    } while (queueElmt && ((queueElmt.rotationCurve && queueElmt.rotationCurve == MOVE.NO_CHANGE) || queueElmt.loop));

	    if (queueElmt){
		if (queueElmt.rotationCurve.isObject3D)
		    return queueElmt.rotationCurve;
		else if (queueElmt.rotationCurve == MOVE.ROTATE_TO_TANGENT)
		    return this.getRotationAngleCurve(queueElmt.pathCurve, 1.0);
		else if (queueElmt.rotationCurve)
		    return queueElmt.rotationCurve.getPointAt(1.0);
		else
		    return null;
	    }
	} 

	// No other move in queue so take the current rotation
	return new THREE.Vector3().setFromEuler(this.obj.rotation);
    }

    to(pos, rotation=null, time=0, startAfter=0,  easing=null){
	var pathCurve, rotationCurve;
	const fromPos = this.getCurPosFromQueue();
	const fromRotation = this.getCurRotationFromQueue(); 

	if (pos){
	    if (pos.constructor === Array){
		pos.unshift(fromPos);
		pathCurve = new THREE.CatmullRomCurve3(pos);
	    } else if (pos instanceof THREE.Vector3) {
		pathCurve = new THREE.LineCurve3(fromPos, pos);
	    } else if (pos == MOVE.NO_CHANGE){
		pathCurve = new THREE.LineCurve3(fromPos, fromPos);
	    } else {
		pathCurve = pos;
	    }
	} else {
	    pathCurve = null;
	}
	
	if (rotation){
	    if (rotation.constructor === Array && !fromRotation.isObject3D){
		rotation.unshift(fromRotation);
		rotationCurve = new THREE.CatmullRomCurve3(rotation);
	    } else if (rotation instanceof THREE.Vector3 && !fromRotation.isObject3D) {
		rotationCurve = new THREE.LineCurve3(fromRotation, rotation);
	    } else if (rotation == MOVE.NO_CHANGE && !fromRotation.isObject3D){
		rotationCurve = new THREE.LineCurve3(fromRotation, fromRotation);
	    } else {
		rotationCurve = rotation;
	    }
	} else {
	    rotationCurve = null;
	}

	this.moveQueue.push({
	    startAfter: startAfter,
	    toTime: time,
	    easing: easing,
	    pathCurve: pathCurve,
	    rotationCurve: rotationCurve,
	    prevLookAtObject: fromRotation
	})

	return this
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
	if (nextMove.startAfter && !nextMove.started){
	    if (time >= nextMove.startAfter){
		// We should start move now
		if (this.log)
		    console.log("Time " + time + " Move " + this.curMove + " started");
		nextMove.started = true;
		time = 0;
		this.clock.start();
	    } else {
		return;
	    }
	}

	// If this is a run then do the run and then stop
	if (nextMove.run){
	    this.clock.stop();
	    nextMove.run(this.obj);
	} else if (nextMove.loop){
	    if (nextMove.loopCnt == 0 || nextMove.curLoopCnt < nextMove.loopCnt){
		// Loop by rewinding the given number of moves
		nextMove.curLoopCnt++;
		this.curMove -= nextMove.loop;
		this.clock.start();
		return
	    } else {
		// Done with the loop so contineu to next move
		nextMove.curLoopCnt=0;
	    }
	} else {
	    // Check move progress and apply easing
	    var progress = Math.min(time,nextMove.toTime)/nextMove.toTime;
	    if (nextMove.easing){
		progress = nextMove.easing(progress);
	    }
	    
	    // Change position and rotation
	    if (nextMove.pathCurve)
		this.obj.position.copy(nextMove.pathCurve.getPointAt(progress));

	    if (nextMove.rotationCurve){
		if (nextMove.rotationCurve.isObject3D){
		    // If roateCurve is a 3D Object then we rotate to face that
		    const objPos = new THREE.Vector3();
		    nextMove.rotationCurve.getWorldPosition(objPos);
		    this.obj.lookAt(objPos);
		} else if (nextMove.rotationCurve == MOVE.ROTATE_TO_TANGENT){
		    this.obj.rotation.setFromVector3(this.getRotationAngleCurve(nextMove.pathCurve, progress));
		} else {
		    var rotationCurve = nextMove.rotationCurve;
		    if (nextMove.prevLookAtObject && nextMove.prevLookAtObject.isObject3D){
			const fromRotation = new THREE.Vector3(this.rotation.x, this.rotation.y, this.rotation.z);
			if (nextMove.rotationCurve.constructor === Array){
			    rotation.unshift(fromRotation);
			    rotationCurve = new THREE.CatmullRomCurve3(rotation);
			} else if (nextMove.rotationCurve instanceof THREE.Vector3) {
			    rotationCurve = new THREE.LineCurve3(fromRotation, rotation);
			} else if (nextMove.rotationCurve == MOVE.NO_CHANGE){
			    rotationCurve = new THREE.LineCurve3(fromRotation, fromRotation);
			}
			newtMove.rotationCurve = rotationCurve;
			nextMove.prevLookAtObject = null;
		    }
		    if (rotationCurve)
			this.obj.rotation.setFromVector3(rotationCurve.getPointAt(progress));
		}
	    }
	    
	    // Check if move is done
	    if (time<nextMove.toTime)
		// Not done yet
		return;
	}
	
	// Move to next move if we have more moves
	nextMove.started=false;
	if (this.moveQueue.length > this.curMove+1){
	    this.curMove++;
	    this.clock.start();
	    if (this.log)
		console.log("Time " + this.clock.elapsedTime + " Waiting for move " + this.curMove);
	} else {
	    this.clock.stop();
	}	
    }	
}

export {MOVE};
