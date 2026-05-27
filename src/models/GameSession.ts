import { Schema, model, Document } from 'mongoose';

export interface IGameSession extends Document {
  playerAddress: string;
  dayId: string;
  weekNumber: number;
  gamesPlayedInCurrentHour: number;
  firstGameInHour: Date | null;
  currentLives: number;
  nextRefillAt: Date | null;
  dailyAccumulatedScore: number;
  weeklyAccumulatedScore: number;
}

const GameSessionSchema = new Schema<IGameSession>({
  playerAddress: { type: String, required: true, lowercase: true },
  dayId: { type: String, required: true },
  weekNumber: { type: Number, required: true },
  gamesPlayedInCurrentHour: { type: Number, default: 0 },
  firstGameInHour: { type: Date, default: null },
  currentLives: { type: Number, default: 5 },
  nextRefillAt: { type: Date, default: null },
  dailyAccumulatedScore: { type: Number, default: 0 },
  weeklyAccumulatedScore: { type: Number, default: 0 }
});

// Compound index for efficient session queries
GameSessionSchema.index({ playerAddress: 1, dayId: 1 }, { unique: true });

export const GameSession = model<IGameSession>('GameSession', GameSessionSchema);
