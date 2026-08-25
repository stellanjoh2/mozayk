import {
  detectOnset,
  highBandRatio,
  ONSET_FLOOR,
  pickLiveAction,
  timeDomainRms,
} from "./analyse";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(timeDomainRms([]) === 0, "empty rms is 0");
  assert(timeDomainRms([128, 128, 128]) === 0, "silence rms is 0");
  const full = timeDomainRms([255, 1]);
  assert(full > 0.9, "full-scale pcm is loud");

  const silentBins = new Array(1024).fill(0);
  assert(highBandRatio(silentBins, 48000) === 0, "silent spectrum is 0");

  const bass = new Array(1024).fill(0);
  for (let i = 0; i < 20; i++) bass[i] = 80;
  assert(highBandRatio(bass, 48000, 2000) < 0.2, "bass-heavy spectrum is low");

  const treble = new Array(1024).fill(0);
  for (let i = 900; i < 1024; i++) treble[i] = 80;
  assert(highBandRatio(treble, 48000, 2000) > 0.7, "treble-heavy spectrum is high");

  assert(
    detectOnset(0.2, 0.05, 1000, 0) === true,
    "rising energy is an onset",
  );
  assert(
    detectOnset(0.2, 0.05, 1000, 950) === false,
    "cooldown blocks a second hit",
  );
  assert(
    detectOnset(ONSET_FLOOR - 0.01, 0, 1000, 0) === false,
    "below the floor is not an onset",
  );
  assert(
    detectOnset(0.2, 0.198, 1000, 0) === true,
    "held music still hits",
  );
  assert(
    detectOnset(0.05, 0.05, 1000, 0, 180, ONSET_FLOOR, 0.05, 0.04) === false,
    "room noise below the gate does not hit",
  );
  assert(
    detectOnset(0.09, 0.09, 1000, 0, 180, ONSET_FLOOR, 0.25) === false,
    "dropout after the music stops does not hit",
  );

  const midSense = { volume: 50, freq: 50 };
  assert(
    pickLiveAction({ volume: 0.005, freq: 0.8 }, midSense, true) === null,
    "silence does not trigger",
  );
  assert(
    pickLiveAction({ volume: 0.2, freq: 0.1 }, midSense, true) === "shapes",
    "regular music rerolls shapes",
  );
  assert(
    pickLiveAction({ volume: 0.55, freq: 0.1 }, midSense, true) === "colours",
    "louder notes swap colours",
  );
  assert(
    pickLiveAction({ volume: 0.2, freq: 0.55 }, midSense, true) === "colours",
    "higher-freq notes swap colours",
  );
  assert(
    pickLiveAction({ volume: 0.75, freq: 0.65 }, midSense, true) === "invert",
    "loud + high inverts",
  );
  assert(
    pickLiveAction({ volume: 0.95, freq: 0.1 }, midSense, true) === "invert",
    "extreme volume inverts even without treble",
  );
  assert(
    pickLiveAction({ volume: 0.55, freq: 0.1 }, midSense, false) === null,
    "no onset means no action",
  );

  assert(
    pickLiveAction({ volume: 0.35, freq: 0.1 }, { volume: 100, freq: 0 }, true) ===
      "colours",
    "high volume sensitivity lowers the loudness bar",
  );
  assert(
    pickLiveAction({ volume: 0.35, freq: 0.1 }, { volume: 0, freq: 0 }, true) ===
      "shapes",
    "low volume sensitivity keeps moderate hits on shapes",
  );
  assert(
    pickLiveAction({ volume: 0.2, freq: 0.28 }, { volume: 0, freq: 100 }, true) ===
      "colours",
    "high frequency sensitivity treats mid-high as colour",
  );
}

run();
console.log("live analyse tests passed");
