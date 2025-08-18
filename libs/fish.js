import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";

class FishPointCloud extends morphPointCloud {

    static FISHTYPES = [
        "../assets/glb/cod.glb",
        "../assets/glb/colorful_fish.glb",
        "../assets/glb/colorful_fish4.glb",
        "../assets/glb/colorful_fish6.glb",
    ];

    static FISH_TESSELATE = [ 
        [0.01, 5],
        [0.01, 5],
        [0.015, 5],
        [0.013, 5]
    ];
    
    setupMoveTexture(){
	this.fishMoveTextureData = new Float32Array(128);
	this.fishMoveTexture = new THREE.DataTexture( this.fishMoveTextureData, 128, 1, THREE.RedFormat, THREE.FloatType,
						     THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
	this.fishMoveTexture.internalFormat = 'R32F';
	this.fishMoveTexture.magFilter = THREE.LinearFilter;
	this.fishMoveTexture.minFilter = THREE.LinearFilter;
    }
    
    updateFishMoveTexture(){
	const time = this.clock.getElapsedTime();
	if (time > (this.updateFreqTime || 0)){
	    this.newMoveFreq = this.baseFreq + this.freqVariation * Math.random();
	    this.phaseOffset = this.phaseOffset + (this.moveFreq-this.newMoveFreq)*time; 
	    this.moveFreq = this.newMoveFreq;
	    this.updateFreqTime = time + 2 + 3*Math.random();
	}

	this.fishMoveTextureData.forEach( (elmt, idx) => {this.fishMoveTextureData[idx] = 0.1*Math.cos(((idx/128) + this.phaseOffset + this.moveFreq*time)*2*Math.PI)});
	this.fishMoveTexture.needsUpdate = true;
    }

    update(){
	if (this.moving)
	    this.updateFishMoveTexture();
	super.update();
    }

    startMoving(){
	this.moving = true;
    }
    
    stopMoving(){
	this.moving = false;
    }

    constructor(type, pointSize, pointSpriteFile, name="Fish Point Cloud", enableBloom=true, extraDescr = {}, dumpPosMap=false, loadPosMap=false){
	super({
            num_points: 100000,
            point_size: pointSize,
            color: 0x0,
            alpha: 1.0,
            point_sprite_file: pointSpriteFile,
            enableBloom: enableBloom,
            name: name
        });

        this.type = type;
        this.extraDescr = extraDescr;
	this.moveFreq = 0;
	this.baseFreq = 0.2;
	this.freqVariation = 0.8;
	this.phaseOffset = 0;
	this.moving = false;
	this.setupMoveTexture();
        this.dumpPosMap=dumpPosMap;
        this.loadPosMap=loadPosMap;
    }

    load(descriptor, initMorphId=0){
	const fishPointCloudDescriptor = [
            { filename: this.constructor.FISHTYPES[this.type],
              sortPos: (this.dumpPosMap &&
                        { sortFunc: (a, b) => (a.z - b.z),
                          downloadFile : this.name.replace(" ", "_").toLowerCase() + "_pos_map.json"
                        }),
	      posMapFile: this.loadPosMap && "../assets/posmaps/" + this.name.replace(" ", "_").toLowerCase() + "_pos_map.json",
	      scale: new THREE.Vector3(2, 2, 2),
	      pos:new THREE.Vector3(0,0,0),
	      tesselate : this.constructor.FISH_TESSELATE[this.type],
	      randPosOrder: false,
	      pos_noise: 0.001,
	      displacementMap: this.fishMoveTexture,
	      displacementMapNormal: new THREE.Vector3(1,0,0),
	      displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
	      textureMap: [null, "../assets/abstract.png"], 
	      textureMapFlags: [morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE, morphPointCloud.TEXTURE_MAP_BLEND_AVG | morphPointCloud.TEXTURE_MAP_ENABLE | 1*morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN |  morphPointCloud.TEXTURE_MAP_VIEW_POS_RELATIVE],
	      textureMapScale: [null, new THREE.Vector2(0.2, 0.2)],
              textureMapViewPos: [null, new THREE.Vector3(0,10,0)],
              scaleTimeFBM: 2,
	      //textureMapFlags: 0*morphPointCloud.TEXTURE_MAP_BLEND_AVG | morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
	    }
        ];

        for (key in this.extraDescr){
            fishPointCloudDescriptor[key] = extraDescr[key];
        }
        
        descriptor.forEach( (x) => {
            // Check ff we want this morph to also move like the fish
            if (x.useFishMovement){
                if (x.displacementMap == null)
	            x.displacementMap = this.fishMoveTexture;
                if (x.displacementMapNormal == null)
	            x.displacementMapNormal = new THREE.Vector3(1,0,0);
                if (x.displacementMapFlags == null)
	            x.displacementMapFlags = morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE;
            }

            fishPointCloudDescriptor.push(x);
        });
            
	return super.load(fishPointCloudDescriptor, descriptor.length ? initMorphId+1 : 0);
    }


    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000, onStart=null, onComplete=null){
	super.morphTo(index+1, easing, time, onStart, onComplete);
    }
}

export {FishPointCloud};
