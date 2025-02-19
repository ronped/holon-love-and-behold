import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";

class SeagullPointCloud extends morphPointCloud {

    static flapStates = {
	normal : {probWeight:5, morphTime:1000}, 
	fast   : {probWeight:5, morphTime:1000/3},
	glide  : {probWeight:5, morphTime:1000, onlyAfter: ["fast"]}
    };
    
    constructor(pointSize, pointSpriteFile, darkenBloom){
	super(199908, pointSize, 0xffffffff, 1.0, pointSpriteFile, null, null, null, darkenBloom);

	this.flapMorph = 0;
	this.flapState = "normal";
	this.flapStateRounds = 3;
    }

    load(descriptor){
	const seagullPointCloudDescriptor = [	
	    { filename: "../assets/seagull-2.glb",
	      scale: new THREE.Vector3(0.2, 0.2, 0.2),
	      pos:new THREE.Vector3(0,0,0),
	      rotate:new THREE.Vector3(Math.PI/2,0,0),
	      animationName: "flap",
	      animationTime: 0,
	      tesselate : [0.02, 6],
	      pos_noise: 0.1,
	      color: 0xffffff,
	    },
	    { filename: "../assets/seagull-2.glb",
	      scale: new THREE.Vector3(0.2, 0.2, 0.2),
	      pos:new THREE.Vector3(0,0,0),
	      rotate:new THREE.Vector3(Math.PI/2,0,0),
	      animationName: "flap",
	      animationTime: 1.6,
	      tesselate : [0.02, 6],
	      pos_noise: 0.1,
	      color: 0xffffff,
	    },
	    { filename: "../assets/seagull-2.glb",
	      scale: new THREE.Vector3(0.2, 0.2, 0.2),
	      pos:new THREE.Vector3(0,0,0),
	      rotate:new THREE.Vector3(Math.PI/2,0,0),
	      animationName: "flap",
	      animationTime: 0.8,
	      tesselate : [0.02, 6],
	      pos_noise: 0.1,
	      color: 0xffffff,
	    },
	];

	seagullPointCloudDescriptor.push(...descriptor);

	return super.load(seagullPointCloudDescriptor);
    }


    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000, onStart=null, onComplete=null){
	// Stop flapping and morph to non flap morph
	const wasFlapping = this.flapping;
	this.stopFlap();
	var newOnComplete = onComplete;
	super.morphTo(index+3, easing, time, onStart, onComplete);
    }
    
    startFlap(){
	if (!this.flapping)
	    this.seagullFlap();
    }

    stopFlap(){
	if (this.flapping && this.pendingMorphTween){
	    // Clear onComplete callback and stop morph
	    this.pendingMorphTween.onComplete(null);
	    this.pendingMorphTween.end();
	    this.flapping = false;
	}	
    }

    updateFlapState(){
	const curState = this.flapState;
	var rand = Math.random();
	var weightSum = 0;
	const flapStates = this.constructor.flapStates;
	for (var state in flapStates){
	    if (!flapStates[state].onlyAfter || flapStates[state].onlyAfter.includes(curState))
		weightSum += flapStates[state].probWeight;
	}
	rand *= weightSum;
	weightSum = 0;
	for (var state in flapStates){
	    if (!flapStates[state].onlyAfter || flapStates[state].onlyAfter.includes(curState)){
		weightSum += flapStates[state].probWeight;
		
		if (rand < weightSum){
		    this.flapState = state;
		    break;
		}
	    }
	}
    }
    

    seagullFlap(){
	this.flapping = true;
	const flapStates = this.constructor.flapStates;
	var nextMorph = Math.floor((this.flapMorph + 1) % 2);
	var morphDuration = flapStates[this.flapState].morphTime;
	if (this.flapState == "glide"){
	    nextMorph = 2; 
	}
	if (--this.flapStateRounds == 0){
	    // Select new state
	    this.updateFlapState();
	    this.flapStateRounds = 3 + Math.floor(Math.random() * 3); 
	}

	super.morphTo(nextMorph, TWEEN.Easing.Linear.None, morphDuration, null,
		      () => this.seagullFlap());
	this.flapMorph = nextMorph;
    }    
}

export {SeagullPointCloud};
