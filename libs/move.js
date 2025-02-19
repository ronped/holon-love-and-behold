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

const _vZero = new THREE.Vector3(0,0,0);
const _m1 = new THREE.Matrix4();
const _euler = new THREE.Euler();

class MOVE {

    static allMoves = [];
    static update(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.updateMove();
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


    getRotationAngleCurve(curve, point, tilt=false){
	const tangent = curve.getTangentAt(point);
	var up = this.obj.up;
	if (tilt){
	    this.objPrevTangent = this.objPrevTangent || curve.getTangentAt(0);
	    const tangentCross = this.objPrevTangent.clone().cross(tangent);
	    const rotateLeft = tangentCross.angleTo(up) < Math.PI/4;
	    const tangentDeltaAngle = this.objPrevTangent.angleTo(tangent);
	    this.objTiltAngleBuffer.push(20*(rotateLeft ? tangentDeltaAngle : -tangentDeltaAngle));
	    if (this.objTiltAngleBuffer.length > 10)
		this.objTiltAngleBuffer.shift();
	    var objTiltAngle = this.objTiltAngleBuffer.reduce(
		(accumulator, currentValue) => accumulator + currentValue/this.objTiltAngleBuffer.length,
		0);
	    objTiltAngle = Math.max(-Math.PI/4, Math.min(objTiltAngle, Math.PI/4));
	    up = up.clone().applyAxisAngle(new THREE.Vector3(0,0,1), objTiltAngle);
	    this.objPrevTangent = tangent;
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

	return new THREE.Vector3().setFromEuler(_euler.setFromRotationMatrix(_m1, "XYZ"));
    }


    static NO_CHANGE = 1;
    static ROTATE_TO_TANGENT = 2;
    static ROTATE_TO_TANGENT_AND_TILT = 3;

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
		else if (queueElmt.rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_TILT)
		    return this.getRotationAngleCurve(queueElmt.pathCurve, 1.0, true);
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
	    prevPosObject: fromPos,
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
	var newMoveStarted = false;
	if (!nextMove.started){
	    if (time >= nextMove.startTime){
		nextMove.started = true;
		newMoveStarted = true;
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
	    var pathCurve = nextMove.pathCurve;
	    if (pathCurve){
		if (pathCurve.isObject3D){
		    const fromPos = this.obj.position;
		    var toPos = pathCurve.getWorldPosition(new THREE.Vector3());
		    toPos = fromPos.clone().lerp(toPos, 0.5);
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
	    if (rotationCurve){
		var rotationDone = false;
		if (rotationCurve.isObject3D || typeof rotationCurve === 'function'){
		    // If roateCurve is a 3D Object then we rotate to face that
		    const objPos = new THREE.Vector3();

		    if (typeof rotationCurve === 'function')
			rotationCurve(objPos);
		    else if (rotationCurve.isMorphCloud)
		    	objPos.copy(rotationCurve.getCurrentMorphCenter());
		    else
		 	rotationCurve.getWorldPosition(objPos);

		    const currentRotation = new THREE.Vector3().setFromEuler(this.obj.rotation);
		    this.obj.lookAt(objPos);
		    var newRotation = new THREE.Vector3().setFromEuler(new THREE.Euler().setFromQuaternion(this.obj.quaternion));
		    const rotationVector = newRotation.clone().sub(currentRotation);
		    // "Normalise" the length to the closest way to get to the new rotation
		    const rotationVectorSign = new THREE.Vector3(rotationVector.x < 0.0 ? -1:1, rotationVector.y < 0.0 ? -1:1, rotationVector.z < 0.0 ? -1:1);
		    const rotateFactor = rotationVector.divide(rotationVectorSign.clone().multiplyScalar(2*Math.PI)).floor().multiply(rotationVectorSign);
		    rotationVector.sub(rotateFactor.multiplyScalar(2*Math.PI));
		    const rotationLength = rotationVector.length();
		    const timeSinceLastRotation = nextMove.prevTime || nextMove.startTime;
		    const deltaTime = time-timeSinceLastRotation;
		    if (deltaTime == 0.0)
			deltaTime = 0.0001;
		    const rotationPerSecond = rotationLength/deltaTime;
		    
		    if (rotationPerSecond > Math.PI/4){
		    	newRotation = currentRotation.add(rotationVector.multiplyScalar(deltaTime*(Math.PI/4)/rotationLength));
	 		this.obj.rotation.setFromVector3(newRotation);
		    }
		} else if (rotationCurve == MOVE.ROTATE_TO_TANGENT){
		    this.obj.rotation.setFromVector3(this.getRotationAngleCurve(nextMove.pathCurve, progress));
		} else if (rotationCurve == MOVE.ROTATE_TO_TANGENT_AND_TILT){
		    this.obj.rotation.setFromVector3(this.getRotationAngleCurve(nextMove.pathCurve, progress, true));
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

		    if (rotationCurve && !rotationDone)
			this.obj.rotation.setFromVector3(rotationCurve.getPointAt(progress));
		}
	    }
	    nextMove.prevTime = time;
   
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
	    if (this.onEnd)
		this.onEnd(this);
	}	
    }	
}

export {MOVE, CurveFunction};
