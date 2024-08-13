import * as THREE from 'three';

class audio2Texture {

    updateTexture(){
	if (this.analyserNode){
	    var get_fft = false;
	    var get_time = false;
	    this.descriptor.forEach( (d, idx) => {
	        if (d.type == audio2Texture.LEVEL){
		    get_fft = true;
	        } else if (d.type == audio2Texture.FREQ_SPECTRUM){
		    get_fft = true;
	        } else if (d.type == audio2Texture.FREQ_SPECTRUM_TIME){
		    get_fft = true;
	        } else if (d.type == audio2Texture.TIME){
		    get_time = true;
	        } else {
	            console.error("Unknown autio2Texture type: " + d.type)
	        }
	    });

	    var fftDataF32;
	    if (get_fft){
		// Get the FFT data
		const fftData = new Uint8Array(this.tex_width);
		this.analyserNode.getByteFrequencyData(fftData);
		fftDataF32 = new Float32Array(this.tex_width);
		fftData.forEach((elmt, idx) => fftDataF32[idx] = (elmt/255));
	    }
	    var timeDataF32;
	    if (get_time){
		// Get the time data
		const timeData = new Uint8Array(this.tex_width);
		this.lowPassAnalyserNode.getByteTimeDomainData(timeData);
		timeDataF32 = new Float32Array(this.tex_width);
		timeData.forEach((elmt, idx) => timeDataF32[idx] = (elmt/255)-0.5);
	    }

	    this.descriptor.forEach( (d, idx) => {
	        if (d.type == audio2Texture.LEVEL){
		    get_fft = true;
		    var sum = 0;
		    fftDataF32.forEach( (d, idx) => {
			sum+=d;
		    });
		    this.tex_data[idx][0] = Math.pow(100.0, sum/this.tex_width)/100.0 - 0.01;
	        } else if (d.type == audio2Texture.FREQ_SPECTRUM){
		    this.tex_data[idx].set(fftDataF32, 0)
	        } else if (d.type == audio2Texture.FREQ_SPECTRUM_TIME){
		    this.tex_data[idx].set(this.tex_data[idx].subarray(0, -this.tex_width), this.tex_width);
		    this.tex_data[idx].set(fftDataF32, 0)
	        } else if (d.type == audio2Texture.TIME){
		    this.tex_data[idx].set(timeDataF32, 0)
	        } else {
	            console.error("Unknown autio2Texture type: " + d.type)
	        }

 		this.texture[idx].needsUpdate = true;
	    })
	}
    }

    start(){
	// Play the audio
	this.audioSourceNode.start();
    }
	
    stop(){
	// Stop the audio
	this.audioSourceNode.stop();
    }

    pause(){
	// Pause the audio
	this.audioSourceNode.pause();
    }

    // Descriptor is a list with elements for each texure that contains
    //
    // type: Type of texture to generate - can be either:
    static FREQ_SPECTRUM_TIME = 0;
    static FREQ_SPECTRUM      = 1;
    static LEVEL              = 2;
    static TIME               = 3;
    
    constructor(audio_file, descriptor, tex_width, tex_height){
	this.texture = [];
	this.tex_data = [];
	this.tex_width = tex_width;
	this.descriptor = descriptor;
	descriptor.forEach( (d, idx) => {
	    var width, height;
	    var wrapS = THREE.MirroredRepeatWrapping;
	    var wrapT = THREE.MirroredRepeatWrapping;
	    if (d.type == audio2Texture.LEVEL){
		width = height = 1;
		wrapS = wrapT =  THREE.ClampToEdgeWrapping;
	    } else if (d.type == audio2Texture.FREQ_SPECTRUM){
		width = tex_width;
		height = 1;
		wrapT = THREE.ClampToEdgeWrapping;
	    } else if (d.type == audio2Texture.FREQ_SPECTRUM_TIME){
		width = tex_width;
		height = tex_height;
	    } else if (d.type == audio2Texture.TIME){
		width = tex_width;
		height = 1;
		wrapT = THREE.ClampToEdgeWrapping;
	    } else {
		console.error("Unknown autio2Texture type: " + d.type)
	    }
		
	    this.tex_data[idx] = new Float32Array(width*height);
	    this.tex_data[idx].fill(0);
	    this.texture[idx] = new THREE.DataTexture( this.tex_data[idx], width, height, THREE.RedFormat, THREE.FloatType,
						       THREE.UVMapping, wrapS, wrapT);
	    this.texture[idx].internalFormat = 'R32F';
	    this.texture[idx].magFilter = THREE.LinearFilter;
	    this.texture[idx].minFilter = THREE.LinearFilter;
	}
	)
	
	this.audioContext = new AudioContext();
	var buffer;
	fetch(audio_file)
	    .then(data => data.arrayBuffer())
	    .then(arrayBuffer => 
		this.audioContext.decodeAudioData(arrayBuffer))
	    .then(decodedAudio => {
		buffer = decodedAudio;
		this.audioSourceNode = this.audioContext.createBufferSource();
		this.audioSourceNode.buffer = buffer;

		//Create analyser node
		this.analyserNode = this.audioContext.createAnalyser();
		this.analyserNode.fftSize = this.tex_width*2;

		//Create Biquad filter node
		this.lowPassAnalyserNode = this.audioContext.createAnalyser();
		this.lowPassAnalyserNode.fftSize = this.tex_width*2;
		this.biquadFilter = this.audioContext.createBiquadFilter();
		this.biquadFilter.type = "lowpass";
		this.biquadFilter.frequency.value = 200;
		
		//Set up audio node network
		this.audioSourceNode.connect(this.analyserNode);
		this.audioSourceNode.connect(this.biquadFilter);
		this.biquadFilter.connect(this.lowPassAnalyserNode);
		this.analyserNode.connect(this.audioContext.destination);
	    })
	
    }
}

export {audio2Texture};

		 
	
		
    
