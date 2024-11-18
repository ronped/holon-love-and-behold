import * as THREE from 'three';
import webfft from 'webfft';

class audio2Texture {

    // Descriptor is a list with elements for each texure that contains
    //
    // type: Type of texture to generate - can be either:
    static FREQ_SPECTRUM_TIME = 0;
    static FREQ_SPECTRUM      = 1;
    static LEVEL              = 2;
    static TIME               = 3;

    static OFFLINE_SAMPLE_RATE = 48000;
    static OFFLINE_CHANNELS = 2;
    
    updateTexture(){
	var get_fft = false;
	var get_time = false;
	var fftDataF32;
	var timeDataF32;
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
	        console.error("Unknown audio2Texture type: " + d.type)
	    }
	});
	if (this.clock.running){
	    const curSample = Math.floor(this.clock.getElapsedTime()*audio2Texture.OFFLINE_SAMPLE_RATE);
	    const timeWindowData = new Float32Array(this.tex_width*2);
	    timeWindowData.fill(0);
	    for (let ch=0; ch < audio2Texture.OFFLINE_CHANNELS; ch++){
		const data = this.renderedBuffer.getChannelData(ch);
		const copyLength = Math.min(timeWindowData.length, data.length-curSample); 
		for (var i=copyLength; i-->0;) timeWindowData[i] += data[i+curSample]/audio2Texture.OFFLINE_CHANNELS;
	    }
	    
	    if (get_fft){
		const fftOut = this.fft.fftr(timeWindowData, 'kissWasm');
		// Get the FFT data
		for (var i=this.fftDataF32.length; i-->0;) this.fftDataF32[i] = this.fftDataF32[i]*this.fftSmoothing + Math.sqrt(fftOut[2*i]**2 + fftOut[2*i+1]**2)/8;
	    }

	    if (get_time){
		timeDataF32 = timeWindowData.slice(0, this.tex_width);
	    }

	    this.descriptor.forEach( (d, idx) => {
	        if (d.type == audio2Texture.LEVEL){
		    var sum = 0;
		    this.fftDataF32.forEach( (d, idx) => {
			sum+=d;
		    });
		    this.tex_data[idx][0] = sum/this.tex_width; // Math.pow(100.0, sum/this.tex_width)/100.0 - 0.01;
	        } else if (d.type == audio2Texture.FREQ_SPECTRUM){
		    this.tex_data[idx].set(this.fftDataF32, 0)
	        } else if (d.type == audio2Texture.FREQ_SPECTRUM_TIME){
		    this.tex_data[idx].set(this.tex_data[idx].subarray(0, -this.tex_width), this.tex_width);
		    this.tex_data[idx].set(this.fftDataF32, 0)
	        } else if (d.type == audio2Texture.TIME){
		    this.tex_data[idx].set(timeDataF32, 0)
	        } else {
	            console.error("Unknown audio2Texture type: " + d.type)
	        }

 		this.texture[idx].needsUpdate = true;
	    })
	}
    }

    start(offline=false){
	// Play the audio
	if (!offline)
	    this.audioSourceNode.start();
	this.clock.start();
	this.offline = offline;
    }
	
    stop(){
	// Stop the audio
	if (!this.offline)
	    this.audioSourceNode.stop();
	this.clock.stop();
    }

    pause(){
	// Pause the audio
	if (!this.offline)
	    this.audioSourceNode.pause();
    }

    
    constructor(audio_file, descriptor, tex_width, tex_height, fft_smoothing=0.5){
	this.texture = [];
	this.tex_data = [];
	this.tex_width = tex_width;
	this.descriptor = descriptor;
	this.fftDataF32 = new Float32Array(this.tex_width);
	this.fftDataF32.fill(0);
	this.fftSmoothing = fft_smoothing;
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
	});

	this.audioContext = new AudioContext();
	this.offlineAudioContext = new OfflineAudioContext(audio2Texture.OFFLINE_CHANNELS, audio2Texture.OFFLINE_SAMPLE_RATE*60, audio2Texture.OFFLINE_SAMPLE_RATE);
	this.clock = new THREE.Clock(false);
	this.fft = new webfft(this.tex_width*2);

	var buffer;
	fetch(audio_file)
	    .then(data => data.arrayBuffer())
	    .then(arrayBuffer => 
		this.audioContext.decodeAudioData(arrayBuffer))
	    .then(decodedAudio => {
		buffer = decodedAudio;
		this.audioSourceNode = this.offlineAudioContext.createBufferSource();
		this.audioSourceNode.buffer = buffer;

		this.audioSourceNode.connect(this.offlineAudioContext.destination);
		this.audioSourceNode.start();
		return this.offlineAudioContext.startRendering();
	    })
	    .then(renderedBuffer => {
		if (renderedBuffer){
		    this.renderedBuffer = renderedBuffer;
		    this.audioSourceNode = new AudioBufferSourceNode(this.audioContext, {
			buffer: renderedBuffer,
		    });
		    this.audioSourceNode.connect(this.audioContext.destination);		    
		}
	    })
    }
}

export {audio2Texture};

		 
	
		
    
