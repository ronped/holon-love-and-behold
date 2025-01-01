import * as THREE from 'three';
import webfft from 'webfft';

class Audio2Texture {

    // Descriptor is a list with elements for each texure that contains
    //
    // type: Type of texture to generate - can be either:
    static FREQ_SPECTRUM_TIME = 0;
    static FREQ_SPECTRUM      = 1;
    static LEVEL              = 2;
    static TIME               = 3;

    static OFFLINE_SAMPLE_RATE = 48000;
    static OFFLINE_CHANNELS = 2;

    // Filters obtained from http://jaggedplanet.com/iir/iir-explorer.asp
    static filter1 = [0.8667884394996352, 15.013711966796784];
    static filter2 = [0.7490960131005089, 7.97117664296492];
    static filter3 = [0.5029922331045651, 4.024081982647926];
    
    static filterSample(sample, prev_sample, prev_out){ 
	return (sample + prev_sample)/this.filter2[1] + prev_out*this.filter2[0];
    }
    
    updateTexture(){
	var get_fft = false;
	var get_time = false;
	this.descriptor.forEach( (d, idx) => {
	    if (d.type == this.constructor.LEVEL){
		get_fft = true;
	    } else if (d.type == this.constructor.FREQ_SPECTRUM){
		get_fft = true;
	    } else if (d.type == this.constructor.FREQ_SPECTRUM_TIME){
		get_fft = true;
	    } else if (d.type == this.constructor.TIME){
		get_time = true;
	    } else {
	        console.error("Unknown Audio2Texture type: " + d.type)
	    }
	});
	if (this.clock.running){
	    var elapsedTime = this.clock.getElapsedTime()+(this.time_offset|| 0);
	    if (this.audioSourceNode.loop)
		elapsedTime = elapsedTime % this.bufferSize;
	    const curSample = Math.floor(elapsedTime*this.constructor.OFFLINE_SAMPLE_RATE);
	    const timeWindowData = new Float32Array(this.tex_width*2).fill(0);
	    for (let ch=0; ch < this.constructor.OFFLINE_CHANNELS; ch++){
		const data = this.renderedBuffer.getChannelData(ch);
		const copyLength = Math.min(timeWindowData.length, data.length-curSample); 
		for (var i=copyLength; i-->0;) timeWindowData[i] += data[i+curSample]/this.constructor.OFFLINE_CHANNELS;
	    }
	    
	    if (get_fft){
		const fftOut = this.fft.fftr(timeWindowData, 'kissWasm');
		// Get the FFT data
		for (var i=this.fftDataF32.length; i-->0;){
		    const rev_i = this.fftDataF32.length-i-1;
		    const level_dbfs = Math.max(20*Math.log(Math.sqrt(fftOut[2*rev_i]**2 + fftOut[2*rev_i+1]**2)), -50);
		    const norm_level = (level_dbfs + 50)/50;
		    if (this.lowpass_smoothing)
			this.fftDataF32[i] = this.constructor.filterSample(norm_level, this.fftDataF32Raw[i], this.fftDataF32[i]);
		    else
			this.fftDataF32[i] = this.fftDataF32[i]*this.fftSmoothing + norm_level;
		    this.fftDataF32Raw[i] = norm_level;
		}
	    }

	    if (get_time){
		const curTimeData = timeWindowData.slice(0, this.tex_width);
		var prevSampleRaw=0, prevSampleFltr=0;
		if (this.lowpass_smoothing)
		    for (var i=this.timeDataF32.length; i-->0;){
			// Lowpass filtering of the actual time signal
			const sample = this.constructor.filterSample(curTimeData[i], prevSampleRaw, prevSampleFltr);
			prevSampleFltr = sample;
			prevSampleRaw = curTimeData[i];
			
			// Lowpass filtering across frames
			this.timeDataF32[i] = this.constructor.filterSample(sample, this.timeDataF32Raw[i], this.timeDataF32[i]);
			this.timeDataF32Raw[i] = sample;
		    }
		else
		    this.timeDataF32 = curTimeData;
	    }

	    this.descriptor.forEach( (d, idx) => {
	        if (d.type == this.constructor.LEVEL){
		    var level = 0;
		    const elements = this.tex_width;
		    this.fftDataF32Raw.forEach( (d, idx) => {
			if (idx < elements)
			    level+=d;
		    });
		    level /= elements;
		    if (this.lowpass_smoothing){
			const fltrLevel = this.constructor.filterSample(level, this.prevLevel || 0, this.prevFltrLevel || 0);
			this.prevLevel = level;
			this.prevFltrLevel = fltrLevel;
			level = fltrLevel;
		    }
		    this.tex_data[idx][0] = Math.pow(10, level)/10; // Math.pow(100.0, sum/this.tex_width)/100.0 - 0.01;
		} else if (d.type == this.constructor.FREQ_SPECTRUM){
		    this.tex_data[idx].set(this.fftDataF32, 0)
	        } else if (d.type == this.constructor.FREQ_SPECTRUM_TIME){
		    this.tex_data[idx].set(this.tex_data[idx].subarray(0, -this.tex_width), this.tex_width);
		    this.tex_data[idx].set(this.fftDataF32, 0)
	        } else if (d.type == this.constructor.TIME){
		    this.tex_data[idx].set(this.timeDataF32, 0)
	        } else {
	            console.error("Unknown Audio2Texture type: " + d.type)
	        }

 		this.texture[idx].needsUpdate = true;
	    })
	}
    }

    start(offline=false){
	// Play the audio
	if (!offline)
	    if (!this.audioSourceNode){
		return;
	    } else {
		this.audioSourceNode.start();
	    }
	else if (!this.renderedBuffer)
	    return
	
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

    
    constructor(audio_file, buffer_size, descriptor, tex_width, tex_height, lowpass_smoothing=true, fft_smoothing=0.5, time_offset=0, loop=false, on_complete=null){
	this.texture = [];
	this.tex_data = [];
	this.tex_width = tex_width;
	this.descriptor = descriptor;
	this.fftDataF32 = new Float32Array(this.tex_width).fill(0);
	this.fftDataF32Raw = new Float32Array(this.tex_width).fill(0);
	this.timeDataF32 = new Float32Array(this.tex_width).fill(0);
	this.timeDataF32Raw = new Float32Array(this.tex_width).fill(0);
	this.lowpass_smoothing = lowpass_smoothing;
	this.fftSmoothing = fft_smoothing;
	this.time_offset = time_offset;
	descriptor.forEach( (d, idx) => {
	    var width, height;
	    var wrapS = THREE.MirroredRepeatWrapping;
	    var wrapT = THREE.MirroredRepeatWrapping;
	    if (d.type == this.constructor.LEVEL){
		width = height = 1;
		wrapS = wrapT =  THREE.ClampToEdgeWrapping;
	    } else if (d.type == this.constructor.FREQ_SPECTRUM){
		width = tex_width;
		height = 1;
		wrapT = THREE.ClampToEdgeWrapping;
	    } else if (d.type == this.constructor.FREQ_SPECTRUM_TIME){
		width = tex_width;
		height = tex_height;
	    } else if (d.type == this.constructor.TIME){
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

	this.bufferSize = buffer_size;
	this.audioContext = new AudioContext();
	this.offlineAudioContext = new OfflineAudioContext(this.constructor.OFFLINE_CHANNELS, this.constructor.OFFLINE_SAMPLE_RATE*this.bufferSize, this.constructor.OFFLINE_SAMPLE_RATE);
	this.clock = new THREE.Clock(false);
	this.fft = new webfft(this.tex_width*2);

	this.promise =
	    fetch(audio_file)
	    .then(data => data.arrayBuffer())
	    .then(arrayBuffer => 
		this.audioContext.decodeAudioData(arrayBuffer))
	    .then(decodedAudio => {
		const audioSourceNode = this.offlineAudioContext.createBufferSource();
		audioSourceNode.buffer = decodedAudio;
		audioSourceNode.connect(this.offlineAudioContext.destination);
		audioSourceNode.start();
		return this.offlineAudioContext.startRendering();
	    })
	    .then(renderedBuffer => {
		if (renderedBuffer){
		    this.renderedBuffer = renderedBuffer;
		    this.audioSourceNode = new AudioBufferSourceNode(this.audioContext, {
			buffer: renderedBuffer,
		    });
		    this.audioSourceNode.loop = loop;
		    this.audioSourceNode.loopStart = 0;
		    this.audioSourceNode.loopEnd = this.bufferSize;
		    this.audioSourceNode.connect(this.audioContext.destination);		    
		}
	    });

	if (on_complete)
	    this.promise.then(on_complete);
    }
}

export {Audio2Texture};

		 
	
		
    
