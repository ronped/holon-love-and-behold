import * as THREE from 'three';

class MOVE {

    static allMoves = [];
    
    static update(){
	MOVE.allMoves.forEach( (obj) => {
	    obj.updateMove();
	})
    }	
    
    constructor(obj){
	this.obj = obj;
	this.clock = new THREE.Clock(false);
	this.moveQueue = [];
	MOVE.allMoves.push(this);
    }

    run(func, startAfter=0){
	this.moveQueue.push({
	    startAfter: startAfter,
	    run: func
	}) 
	this.clock.start();
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
	//const flip_z = ((angle_x % 2*Math.PI) > Math.PI/2) && ((angle_x % 2*Math.PI) < 3*Math.PI/2);
	//const tangent_z = flip_z ? -tangent.z : tangent.z; 
	var angle_y = Math.atan2(tangent.x,tangent.z);
	return new THREE.Vector3(angle_x, angle_y, 0);
    }
    
    to(pos, time, startAfter=0, rotation=null, easing=null){
	var fromRotation, fromPos;
	if (this.moveQueue.length>0){
	    // Get start position/rotation after previous move is done
	    if (this.moveQueue[this.moveQueue.length-1].rotationCurve){
		fromRotation = this.moveQueue[this.moveQueue.length-1].rotationCurve.getPointAt(1.0);
	    } else {
		fromRotation = this.getRotationAngleCurve(this.moveQueue[this.moveQueue.length-1].pathCurve, 1.0);
	    }
	    fromPos = this.moveQueue[this.moveQueue.length-1].pathCurve.getPointAt(1.0);
	} else {
	    // No other move in queue so take the current position/rotation
	    fromRotation = new THREE.Vector3().setFromEuler(this.obj.rotation);
	    fromPos = this.obj.position.clone();
	}

	var pathCurve, rotationCurve;
	
	if (pos){
	    if (pos.constructor === Array){
		pos.unshift(fromPos);
		pathCurve = new THREE.CatmullRomCurve3(pos);
	    } else {
		pathCurve = new THREE.LineCurve3(fromPos, pos);
	    }
	} else {
	    pathCurve = new THREE.LineCurve3(fromPos, fromPos);
	}
	
	if (rotation){
	    if (rotation.constructor === Array){
		rotation.unshift(fromRotation);
		rotationCurve = new THREE.CatmullRomCurve3(rotation);
	    } else {
		rotationCurve = new THREE.LineCurve3(fromRotation, rotation);
	    }
	} else {
	    //rotationCurve = new THREE.LineCurve3(fromRotation, fromRotation);
	    rotationCurve = null;
	}

	this.moveQueue.push({
	    startAfter: startAfter,
	    toTime: time,
	    easing: easing,
	    pathCurve: pathCurve,
	    rotationCurve: rotationCurve
	})

	this.clock.start();
	return this
    }

    
    updateMove(){
	// If no move is running just exit
	if (!this.clock.running){
	    return;
	}

	// Get current move
	const nextMove = this.moveQueue[0];

	// Get elapsed time
	var time = this.clock.getElapsedTime();

	// Check if we are still waiting for the move to start
	if (nextMove.startAfter){
	    if (time >= nextMove.startAfter){
		// We should start move now
		nextMove.startAfter = null;
		// If this is a run then do the run and then stop
		if (nextMove.run){
		    this.clock.stop();
		    nextMove.run(this.obj);
		    return;
		}
		this.clock.start();
	    }
	    return;
	}

	// Check if move is done
	if (time>nextMove.toTime){
	    time = nextMove.toTime;
	    // Stop clock and remove move from queue
	    this.clock.stop();
	    this.moveQueue.shift();
	    if (this.moveQueue.length > 0){
		this.clock.start();
	    }
	}

	// Check move progress and apply easing
	var progress = time/nextMove.toTime;
	if (nextMove.easing){
	    progress = nextMove.easing(progress);
	}

	// Change position and rotation
	this.obj.position.copy(nextMove.pathCurve.getPointAt(progress));
	if (nextMove.rotationCurve){
	    this.obj.rotation.setFromVector3(nextMove.rotationCurve.getPointAt(progress));
	} else {
	    this.obj.rotation.setFromVector3(this.getRotationAngleCurve(nextMove.pathCurve, progress));
	}
    }	
    
}

export {MOVE};
