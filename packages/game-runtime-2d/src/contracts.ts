export type Runtime2DConfig = {
  width: number;
  height: number;
  targetFps: number;
  maxEnemies: number;
  maxParticles: number;
};

export type GameState = {
  running: boolean;
  score: number;
  health: number;
  won: boolean;
  lost: boolean;
};
