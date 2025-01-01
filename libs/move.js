import * as THREE from 'three';


class CurveFunction {

    constructor(func){
	this.func = func;
    }

    getTangentAt(point){
	const p1 = this.getPointAt(point);
	const p0 = this.getPointAt(point-0.001);
	return p1.sub(p0);
    }

    getPointAt(point){
	return this.func(point);
    }

}


class MOVE {

    static allMoves = [];
    static update(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.updateMove();
	})
    }	
    
    constructor(obj, absoluteStartTime=false, log=false){
	this.obj = obj;
	this.clock = new THREE.Clock(false);
	this.moveQueue = [];
	this.curMove = 0;
	this.absoluteStartTime = absoluteStartTime;
	this.log = log;
	if (this.log && typeof this.log !== 'string' && !(this.log instanceof String))
	    this.log = obj.constructor.name;
	MOVE.allMoves.push(this);
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

    start(){
	this.clock.start();
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

    to(pos, rotation=null, time=0, startTime=0,  easing=null){
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

	var startAfter;
	if (this.absoluteStartTime){
	    startAfter = startTime-this.getMoveEndTime();
	    if (startAfter < 0)
		console.error("MOVE.to() scheduled in past by " + startAfter + " seconds");
	} else {
	    startAfter = startTime;
	    startTime = this.getMoveEndTime() + startAfter;
	}
	const endTime = startTime + time;
	this.moveQueue.push({
	    startAfter: startAfter,
	    toTime: time,
	    startTime: startTime,
	    endTime: endTime,
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
	if (!nextMove.started){
	    if (time >= nextMove.startTime){
		nextMove.started = true;
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
	    var progress = Math.min(time-nextMove.startTime,nextMove.toTime)/nextMove.toTime;
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
			const fromRotation = new THREE.Vector3(this.obj.rotation.x, this.obj.rotation.y, this.obj.rotation.z);
			if (rotationCurve.constructor === Array){
			    rotationCurve.unshift(fromRotation);
			    rotationCurve = new THREE.CatmullRomCurve3(rotationCurve);
			} else if (rotationCurve instanceof THREE.Vector3) {
			    rotationCurve = new THREE.LineCurve3(fromRotation, rotationCurve);
			} else if (rotationCurve == MOVE.NO_CHANGE){
			    rotationCurve = new THREE.LineCurve3(fromRotation, fromRotation);
			}
			nextMove.rotationCurve = rotationCurve;
			nextMove.prevLookAtObject = null;
		    }
		    if (rotationCurve)
			this.obj.rotation.setFromVector3(rotationCurve.getPointAt(progress));
		}
	    }
	    
	    // Check if move is done
	    if ((time-nextMove.startTime)<nextMove.toTime)
		// Not done yet
		return;
	}
	
	// Move to next move if we have more moves
	nextMove.started=false;
	if (this.moveQueue.length > this.curMove+1){
	    this.curMove++;
	    if (this.log)
		console.log(this.log + ": Time " + this.clock.getElapsedTime() + " Waiting for move " + this.curMove);
	} else {
	    this.clock.stop();
	}	
    }	
}

export {MOVE, CurveFunction};
