import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";

class SeagullPointCloud extends morphPointCloud {

    static flapStates = {
	normal : {probWeight:5, morphTime:1000}, 
	fast   : {probWeight:5, morphTime:1000/3},
	glide  : {probWeight:5, morphTime:1000, onlyAfter: ["fast"]}
    };

    static FLAP_RANDOM_MODE = 0;
    static FLAP_FREQUENCY_MODE = 1;
    
    constructor(pointSize, pointSpriteFile, darkenBloom, name="Seagull Point Cloud", dumpPosMap=false, loadPosMap=false){
        const points = 199908;
	var pointMapSelect = null;
	if (pointSpriteFile.constructor === Array){
	    const numSprites = pointSpriteFile.length;
	    pointMapSelect = new Array(points);
	    for (let i=0; i<pointMapSelect.length; i++)
		pointMapSelect[i] = Math.floor(Math.random() * numSprites);
	}
	super({
            num_points: points,
            point_size: pointSize,
            color: 0xffffff,
            alpha: 1.0,
            point_sprite_file: pointSpriteFile,
            enableBloom: darkenBloom,
            pointMapIndex: pointMapSelect,
            name: name
        });

        this.dumpPosMap = dumpPosMap;
        this.loadPosMap = loadPosMap;
	this.flapMorph = 0;
	this.flapState = "normal";
	this.flapStateRounds = 3;
	this.baseFlapMorph = 0;
	this.tesselate = [0.02, 6];
    }

    
    load(descriptor){
        const bloomIntensity = 0.5;
	const seagullPointCloudDescriptor = [	
	    { filename: "../assets/glb/seagull-2.glb",
	      scale: new THREE.Vector3(0.2, 0.2, 0.2),
	      pos:new THREE.Vector3(0,-0.5,-0.25),
	      rotate:new THREE.Vector3(0.7*Math.PI/2,0,0),
	      animationName: "flap",
	      animationTime: 0,
              bloomIntensity: bloomIntensity,
	      tesselate : this.tesselate,
	      pos_noise: 0.1,
              posMapFile: this.loadPosMap && "../assets/posmaps/seagull_pos_map.json",
	      //color: 0xffffff,
	    },
	    { filename: "../assets/glb/seagull-2.glb",
	      scale: new THREE.Vector3(0.2, 0.2, 0.2),
	      pos:new THREE.Vector3(0,-0.5,-0.25),
	      rotate:new THREE.Vector3(0.7*Math.PI/2,0,0),
	      animationName: "flap",
	      animationTime: 1.6,
              bloomIntensity: bloomIntensity,
	      tesselate : this.tesselate,
	      pos_noise: 0.1,
              posMapFile: this.loadPosMap && "../assets/posmaps/seagull_pos_map.json",
	      //color: 0xffffff,
	    },
	    { filename: "../assets/glb/seagull-2.glb",
	      scale: new THREE.Vector3(0.2, 0.2, 0.2),
	      pos:new THREE.Vector3(0,-0.5,-0.25),
	      rotate:new THREE.Vector3(0.7*Math.PI/2,0,0),
	      animationName: "flap",
	      animationTime: 0.8,
              bloomIntensity: bloomIntensity,
	      tesselate : this.tesselate,
	      pos_noise: 0.1,
              sortPos: this.dumpPosMap && { sortFunc: (a, b) => (a.x - b.x),
                                            downloadFile: "seagull_pos_map.json"
                                          },
              //sortPosSpheric: /*this.dumpPosMap &&*/ { downloadFile: "seagull_pos_map.json" },
              posMapFile: this.loadPosMap && "../assets/posmaps/seagull_pos_map.json",
	      //color: 0xffffff,
	    },
	];

	seagullPointCloudDescriptor.push(...descriptor);

	return super.load(seagullPointCloudDescriptor);
    }


    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000, onStart=null, onComplete=null){
	// Stop flapping and morph to non flap morph
	const wasFlapping = this.flapping;
	this.stopFlap();
	super.morphTo(index+3, easing, time, onStart, onComplete);
    }

    morphToFlapMorph(index){
	this.baseFlapMorph = 3*(index+1);
    }
    
    startFlap(mode=this.constructor.FLAP_RANDOM_MODE, frequency=1){
        if (this.flapping)
            this.stopFlap();

	this.seagullFlap(mode, frequency);
    }

    stopFlap(){
	if (this.flapping && this.pendingMorphTween && this.pendingMorphTween[0]){
	    // Clear onComplete callback and stop morph
	    this.pendingMorphTween[0].onComplete(null);
	    this.pendingMorphTween[0].end();
            TWEEN.remove(this.pendingMorphTween[0]);
	    this.flapping = false;
	    super.morphTo(2, TWEEN.Easing.Linear.None, 1000);
	}	
    }

    getCurrentMorphCenter(){
	const d = this.descriptor[2];
	return this.localToWorld(d.cloudBounds.center());
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
    

    seagullFlap(mode=this.constructor.FLAP_RANDOM_MODE, frequency=1){
	this.flapping = true;
	var nextMorph = Math.floor((this.flapMorph + 1) % 2);
        var morphDuration;
        if (mode == this.constructor.FLAP_RANDOM_MODE){
	    const flapStates = this.constructor.flapStates;
	    morphDuration = flapStates[this.flapState].morphTime;
	    if (this.flapState == "glide"){
	        nextMorph = 2; 
	    }
	    if (--this.flapStateRounds == 0){
	        // Select new state
	        this.updateFlapState();
	        this.flapStateRounds = 3 + Math.floor(Math.random() * 3); 
	    }
        } else if (mode == this.constructor.FLAP_FREQUENCY_MODE){
            morphDuration = 1000*(0.5/frequency);
        }
	super.morphTo(this.baseFlapMorph + nextMorph, TWEEN.Easing.Linear.None, morphDuration, null,
		      () => this.seagullFlap(mode, frequency));
	this.flapMorph = nextMorph;
    }    
}

export {SeagullPointCloud};
