import * as THREE from 'three';


class RandomPath {

    constructor(param){
	this.curPoint = param.startPoint || new THREE.Vector3(0,0,0);
	this.curDirection = param.startDirection || new THREE.Vector3(1,0,0);
	this.pointDistance =  param.pointDistance || 1.0;
	this.maxAngleXZ = param.maxAngleXZ || Math.PI/2;
	this.maxAngleY = param.maxAngleY || Math.PI/2;
	this.boundBox = param.boundBox;
	this.deltaAngleXZRandFunc = param.deltaAngleXZRandFunc || this.deltaAngleRand;
	this.deltaAngleYRandFunc = param.deltaAngleYRandFunc || this.deltaAngleRand;
	this.generateMarginBbox();
    }

    deltaAngleRand(maxAngle){
	// Get delta angles for new direction
	return this.constructor.randDist()*maxAngle;
    }
    
    static randDist(){
	return Math.pow(2*(Math.random()-0.5), 3.0); 
    }

    generateMarginBbox(){
	// We must not go to a point where we need to move at steeper angle than allowed
	// to turn. We therefore need to make us an inner bounding box with points that will always be safe
	// to move to. Assume that worst case is coming straight at a boundary. Then we need to count how
	// many points we need at least to turn 90 degrees and how long a distance we need to move towards
	// the boundary for doing this.
	const turnMovesXZ = Math.ceil((Math.PI/2)/this.maxAngleXZ);
	const turnMovesY = Math.ceil((Math.PI/2)/this.maxAngleY);
	
	var turnMarginXZ = 0;
	var turnMarginY = 0;
	for (let i=0; i<turnMovesXZ; i++){
	    turnMarginXZ += this.pointDistance*Math.cos((i+1)*0.5*Math.PI/turnMovesXZ);
	}
	for (let i=0; i<turnMovesY; i++){
	    turnMarginY += this.pointDistance*Math.cos((i+1)*0.5*Math.PI/turnMovesY);
	}

	// Contract bounding box
	this.marginBoundBox = this.boundBox.clone().expandByVector(new THREE.Vector3(-turnMarginXZ, -turnMarginY, -turnMarginXZ));
    }
    
    generatePointPath(numPoints){
	const points = [this.curPoint];
	
	var direction = this.curDirection;
	var point = this.curPoint;
	
	for (let i=0; i<numPoints; i++){
	    // Get delta angles for new direction
	    var deltaAngleXZ = this.deltaAngleXZRandFunc(this.maxAngleXZ);
	    var deltaAngleY = this.deltaAngleYRandFunc(this.maxAngleY);
	    // Get rotation of current direction vector
	    const rotMatrix = new THREE.Matrix4().lookAt(direction, new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0));
	    const rotQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
	    // Get rotated version of x and y axis which will be the x and y axis if the
	    // direction vector is in the direction of the positive z axis
	    const rotXAxis = new THREE.Vector3(1,0,0).applyQuaternion(rotQuat);
	    const rotYAxis = new THREE.Vector3(0,1,0).applyQuaternion(rotQuat);

	    var retry = false;
	    do {
		// Apply rotations to direction vector - first rotate with delta angle around
		// the direction vectors y-axis. We also need to rotate the x-axis vector
		// to adjust before we rotate around the x-axis
		const newDirection = direction.clone().applyAxisAngle(rotYAxis, deltaAngleY);
		newDirection.applyAxisAngle(rotXAxis.clone().applyAxisAngle(rotYAxis, deltaAngleY), deltaAngleXZ);
		// New point is then obtained by moving from the current point in the new direction
		// with the distance given by pointDistance
		const newPoint = point.clone().add(newDirection.normalize().multiplyScalar(this.pointDistance));
		
		// Check if point is inside of the bounding box
		if (!retry && !this.marginBoundBox.containsPoint(newPoint)){
		    // If not we want to change the direction to be
		    // the maximum allowed angle that gives it the fastest
		    // turn in towards the center of the bounding box
		    retry = true;
		    const clampedPoint = this.marginBoundBox.clampPoint(newPoint, new THREE.Vector3());
		    // Check if we are outside the X coordinate boundaries
		    if (newPoint.x != clampedPoint.x && (!this.recoverOutsideBoundary || this.recoverOutsideBoundary == "x")){
			// If outside min x boundary:
			// If z-component of direction is positive then rotate in positive direction
			// around y-axis and opposite if component is negative
			// If outside max x boundary then we rotate the opposite way
			const rotateDir = (clampedPoint.x == this.marginBoundBox.min.x) ? 1.0 : -1.0;
			deltaAngleY = rotateDir*Math.sign(direction.z || 1.0)*this.maxAngleY;
			this.recoverOutsideBoundary = "x";
		    } else if (newPoint.z != clampedPoint.z && (!this.recoverOutsideBoundary || this.recoverOutsideBoundary == "z")){
			// If outside min z boundary:
			// If z-component of direction is positive then rotate in negative direction
			// around y-axis and opposite if component is negative
			// If outside max x boundary then we rotate the opposite way
			const rotateDir = (clampedPoint.z == this.marginBoundBox.min.z) ? -1.0 : 1.0;
			deltaAngleY = rotateDir*Math.sign(direction.x || 1.0)*this.maxAngleY;
			this.recoverOutsideBoundary = "z";
		    } else {
			this.recoverOutsideBoundary = null;
		    }

		    // Check if we are outside the Y coordinate boundaries
		    if (newPoint.y != clampedPoint.y){
			// If outside min y boundary:
			// If y-axis of direction vector (assuming direction is z-axis) is positive then
			// rotate in negative direction as that will be closest to turn around
			// around y-axis and opposite if component is negative
			// Likewise for outside max y boundary we do the opposite
			const rotateDir = (clampedPoint.y == this.marginBoundBox.min.y) ? -1.0 : 1.0;
			deltaAngleXZ = rotateDir*Math.sign(rotYAxis.y || 1.0)*this.maxAngleXZ;
		    }
		} else {
		    point = newPoint;
		    direction = newDirection;
		    points.push(newPoint);
		    retry = false;
		}
	    } while (retry);
	}

	this.curPoint = point;
	this.curDirection = direction;
	
	return new THREE.CatmullRomCurve3(points);
    }
}

export {RandomPath};
