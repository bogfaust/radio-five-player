import { STREAM_URL } from '../config.js';

const audio = document.getElementById('audioPlayer');
audio.volume = 1.0;

const feedbackAudio = document.getElementById('feedbackPlayer');
feedbackAudio.volume = 0.7;

const stoppingAudio = document.getElementById('stoppingPlayer');
stoppingAudio.volume = 0.7;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playFeedback') {
    feedbackAudio.currentTime = 0;
    feedbackAudio.play().catch(err => console.log('Feedback sound error:', err));
    sendResponse({status: 'ok'});

  } else if (message.action === 'playStopFeedback') {
    stoppingAudio.currentTime = 0;
    stoppingAudio.play().catch(err => console.log('Stop feedback sound error:', err));
    sendResponse({status: 'ok'});

  } else if (message.action === 'play') {
    const streamUrl = message.streamUrl || STREAM_URL;

    // Для живого стрима canplay/canplaythrough могут не прийти,
    // поэтому просто меняем src и вызываем play() — браузер начнёт
    // буферизацию и воспроизведение сам
    audio.pause();
    audio.src = streamUrl;

    audio.play()
      .then(() => {
        console.log('Playing:', streamUrl);
      })
      .catch(err => {
        console.error('Play failed:', err.name, err.message);
      });

    // Отвечаем сразу, не ждём play() — иначе канал закроется
    sendResponse({status: 'playing'});

  } else if (message.action === 'pause') {
    audio.pause();
    audio.src = '';
    sendResponse({status: 'paused'});

  } else if (message.action === 'getState') {
    sendResponse({isPlaying: !audio.paused});

  } else if (message.action === 'setVolume') {
    audio.volume = message.volume;
    sendResponse({status: 'volume_set'});
  }

  return true;
});
