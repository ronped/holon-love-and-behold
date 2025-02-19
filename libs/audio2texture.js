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


    static compressSample(sample, threshold, ratio){
	if (Math.abs(sample) > threshold){
	    return Math.sign(sample)*(threshold + (Math.abs(sample) - threshold)/ratio);
	} else {
	    return sample;
	}
    }
    
    updateTexture(){
	var get_fft = this.get_fft || false;
	var get_time = this.get_time || false;

	if (this.clock.running){
	    var elapsedTime = this.clock.getElapsedTime()+(this.time_offset || 0);
	    if (this.audioSourceNode.loop)
		elapsedTime = elapsedTime % this.bufferSize;

	    
	    // Round down to nearest window of this.tex_width*2 samples
	    var curSample = Math.floor(elapsedTime*this.constructor.OFFLINE_SAMPLE_RATE/(this.tex_width*2))*this.tex_width*2;
	    const lastUpdateNextSample = this.prevSample + this.tex_width*2;
	    
	    // Check how many samples in between the current sample and where the previous update ended
	    const samplesSinceLastUpdate = curSample - lastUpdateNextSample;
	    this.prevSample = curSample;
	    
	    const numWindowsToProcess = Math.floor(samplesSinceLastUpdate/this.tex_width*2)+1;

	    for (let w=0; w<numWindowsToProcess; w++){ 
		curSample = lastUpdateNextSample + w*this.tex_width*2;
	    
		const timeWindowData = new Float32Array(this.tex_width*2).fill(0);
		const data = [];
		for (let ch=0; ch < this.constructor.OFFLINE_CHANNELS; ch++){
		    data[ch] = this.renderedBuffer.getChannelData(ch);
		}
		const copyLength = Math.min(timeWindowData.length, data[0].length-curSample); 
		for (var i=copyLength; i-->0;){
		    for (let ch=0; ch < this.constructor.OFFLINE_CHANNELS; ch++)
			timeWindowData[i] += Math.pow(data[ch][i+curSample], this.constructor.OFFLINE_CHANNELS);
		    timeWindowData[i] = Math.pow(timeWindowData[i], 1/this.constructor.OFFLINE_CHANNELS);
		}
		
		if (get_fft){
		    const fftOut = this.fft.fftr(timeWindowData, 'kissWasm');
		    // Get the FFT data
		    for (var i=this.fftDataF32Raw.length; i-->0;){
			this.fftDataF32Raw[i] = Math.sqrt(fftOut[2*i]**2 + fftOut[2*i+1]**2);
			const level_dbfs = Math.max(20*Math.log(this.fftDataF32Raw[i]), -50);
			const norm_level = (level_dbfs + 50)/50;
			this.prevFftDataF32DBFS[i] = this.fftDataF32DBFS[i];
			this.fftDataF32DBFS[i] = norm_level;
		    }
		}
		
		if (get_time){
		    this.timeDataF32 = timeWindowData.slice(0, this.tex_width);
		}
		
		this.descriptor.forEach( (d, idx) => {
	            if (d.type == this.constructor.LEVEL){
			// Select bands to use
			const startFreq = d.startFreq || 0;
			const endFreq = d.endFreq || this.constructor.OFFLINE_SAMPLE_RATE/2-1;
			const sampleStart = Math.max(0, Math.floor(startFreq/this.fftBandSize));
			const sampleEnd = Math.min(this.tex_width-1, Math.ceil(endFreq/this.fftBandSize));

			// Get average level of the frequency band in question 
			var level = this.fftDataF32DBFS.slice(sampleStart, sampleEnd+1).reduce( (acc, val) => acc + val, 0)/(sampleEnd-sampleStart+1);

			// Get the moving average withing the moving average window of all previous levels of the frequency band
			if (d.offsetFromAverage){
			    d.movingAverageWindow = d.movingAverageWindow || [];
			    d.movingAverageInsertIdx = d.movingAverageInsertIdx || 0;
			    var prevLevel = level;
			    if (d.movingAverageWindow.length > 0){
				const movingAverage = d.movingAverageWindow.reduce((acc, val) => acc + val, 0)/d.movingAverageWindow.length;
				//const variance = d.movingAverageWindow.reduce((acc, val) => acc + Math.pow(val-movingAverage, 2), 0)/d.movingAverageWindow.length;
				level -= movingAverage;
			    }

			    // Update the moving average samples
			    d.movingAverageWindow[d.movingAverageInsertIdx++] = prevLevel;
			    d.movingAverageInsertIdx %= Math.floor(((d.movingAverageWindowLength || 1) *this.constructor.OFFLINE_SAMPLE_RATE/(this.tex_width*2)));
			}

			if (d.lowpassSmooth){
			    const fltrLevel = this.constructor.filterSample(level, this.prevLevel || 0, this.prevFltrLevel || 0);
			    this.prevLevel = level;
			    this.prevFltrLevel = fltrLevel;
			    level = fltrLevel;			    
			}

			if (d.compressThreshold)
			    level = this.constructor.compressSample(level, d.compressThreshold, d.compressRatio || 4);

			if (d.expand)
			    level = Math.pow(10, level)/10;

			if (d.clipLow)
			    level = Math.max(d.clipLow, level);
			
			if (d.clipHigh)
			    level = Math.min(d.clipHigh, level);
			
			if (w==0)
			    this.tex_data[idx][0] = 0;
			this.tex_data[idx][0] += level/numWindowsToProcess;


		    } else if (d.type == this.constructor.FREQ_SPECTRUM){
			if (d.lowpassSmooth)
			    for (var i=this.fftDataF32DBFS.length; i-->0;)
				this.tex_data[idx][i] = this.constructor.filterSample(this.fftDataF32DBFS[i], this.prevFftDataF32DBFS[i], this.tex_data[idx][i]);

			else
			    this.tex_data[idx].set(this.fftDataF32DBFS, 0)
	            } else if (d.type == this.constructor.FREQ_SPECTRUM_TIME){
			this.tex_data[idx].set(this.tex_data[idx].subarray(0, -this.tex_width), this.tex_width);
			if (d.lowpassSmooth)
			    for (var i=this.fftDataF32DBFS.length; i-->0;)
				this.tex_data[idx][i] = this.constructor.filterSample(this.fftDataF32DBFS[i], this.prevFftDataF32DBFS[i], this.tex_data[idx][i]);
			
			else
			    this.tex_data[idx].set(this.fftDataF32DBFS, 0)
	            } else if (d.type == this.constructor.TIME){
			if (d.lowpassSmooth){
			    var prevSampleRaw=0, prevSampleFltr=0;
			    d.prevTimeData = d.prevTimeData || new Float32Array(this.tex_width).fill(0);
			    for (var i=this.timeDataF32.length; i-->0;){
				// Lowpass filtering of the actual time signal
				const sample = this.constructor.filterSample(this.timeDataF32[i], prevSampleRaw, prevSampleFltr);
				prevSampleFltr = sample;
				prevSampleRaw = this.timeDataF32[i];
			    
				// Lowpass filtering across frames
				this.tex_data[idx][i] = this.constructor.filterSample(sample, d.prevTimeData[i], this.tex_data[idx][i]);
				d.prevTimeData[i] = sample;
			    }
			} else {
			    this.tex_data[idx].set(this.timeDataF32, 0)
			}
	            } else {
			console.error("Unknown Audio2Texture type: " + d.type)
	            }
		    
 		    this.texture[idx].needsUpdate = true;
		})
	    }
	}
    }

    start(offline=false, fromTime=null){
	// Play the audio
	if (!offline)
	    if (!this.audioSourceNode){
		return;
	    } else {
		this.audioSourceNode.start(0, fromTime ? fromTime : 0);
	    }
	else if (!this.renderedBuffer)
	    return
	
	this.clock.start();
	if (fromTime)
	    this.clock.elapsedTime = fromTime;
	this.offline = offline;
    }
	
    stop(){
	// Stop the audio
	if (!this.offline && this.audioSourceNode && this.clock.running){
	    this.audioSourceNode.stop();
	    this.audioSourceNode = null;
	    this.makeAudioNode();
	}
	this.clock.stop();
    }

    pause(){
	// Pause the audio
	if (!this.offline)
	    this.audioSourceNode.pause();
    }

    makeAudioNode(){
	this.audioSourceNode = new AudioBufferSourceNode(this.audioContext, {
	    buffer: this.renderedBuffer,
	});
	this.audioSourceNode.loop = this.loop;
	this.audioSourceNode.loopStart = 0;
	this.audioSourceNode.loopEnd = this.bufferSize;
	this.audioSourceNode.connect(this.audioContext.destination);		    
    }

    
    constructor(audio_file, buffer_size, descriptor, tex_width, tex_height, time_offset=0, loop=false, on_complete=null){
	this.texture = [];
	this.tex_data = [];
	this.tex_width = tex_width;
	this.descriptor = descriptor;
	this.loop = loop;
	this.fftDataF32Raw = new Float32Array(this.tex_width).fill(0);
	this.fftDataF32DBFS = new Float32Array(this.tex_width).fill(0);
	this.prevFftDataF32DBFS = new Float32Array(this.tex_width).fill(0);
	this.timeDataF32 = new Float32Array(this.tex_width).fill(0);
	this.timeDataF32Raw = new Float32Array(this.tex_width).fill(0);
	this.time_offset = time_offset;
	descriptor.forEach( (d, idx) => {
	    var width, height;
	    var wrapS = THREE.MirroredRepeatWrapping;
	    var wrapT = THREE.MirroredRepeatWrapping;
	    if (d.type == this.constructor.LEVEL){
		this.get_fft = true;
		width = height = 1;
		wrapS = wrapT =  THREE.ClampToEdgeWrapping;
	    } else if (d.type == this.constructor.FREQ_SPECTRUM){
		this.get_fft = true;
		width = tex_width;
		height = 1;
		wrapT = THREE.ClampToEdgeWrapping;
	    } else if (d.type == this.constructor.FREQ_SPECTRUM_TIME){
		this.get_fft = true;
		width = tex_width;
		height = tex_height;
	    } else if (d.type == this.constructor.TIME){
		this.get_time = true;
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
	this.fftBandSize = (this.constructor.OFFLINE_SAMPLE_RATE/2)/(this.tex_width);
	
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
		    this.makeAudioNode();
		}
	    });

	if (on_complete)
	    this.promise.then(on_complete);
    }
}

export {Audio2Texture};

		 
	
		
    
