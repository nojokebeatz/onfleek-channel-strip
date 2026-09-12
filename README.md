# OnFleek Channel Strip

An SSL-9000-style vocal channel strip for your USB microphone, as a Windows desktop app.

**Mic → Filters → Gate/Expander → Compressor → 4-band EQ → Fader → Output**

## Setup (one time)
1. Install the free **VB-CABLE** driver: https://vb-audio.com/Cable/ (reboot if it asks).
2. Run the app. Set **MIC IN** to your microphone and **SEND TO** to **CABLE Input**.
3. In Zoom / Discord / OBS / Teams, choose **CABLE Output** as the microphone.

Press **LISTEN** to hear the result in your own headphones while you tune it.

## Build from source
```
npm install
npm test
npm start
npm run dist
```
