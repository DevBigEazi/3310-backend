import mongoose, { Document, Schema } from 'mongoose';

export interface IGameSession extends Document {
  playerAddress: string;
  firstGameInHour: Date;
  gamesPlayedInCurrentHour: number;
  weekNumber: number;
  weeklyAccumulatedScore: number;
  lastUpdated: Date;
  hasReceived25PointBonus?: boolean;
}

const gameSessionSchema = new Schema<IGameSession>({
  playerAddress: { type: String, required: true, lowercase: true, index: true },
  firstGameInHour: { type: Date, default: Date.now },
  gamesPlayedInCurrentHour: { type: Number, default: 0 },
  weekNumber: { type: Number, required: true },
  weeklyAccumulatedScore: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  hasReceived25PointBonus: { type: Boolean, default: false }
});

// Compound index for efficient queries
gameSessionSchema.index({ playerAddress: 1, weekNumber: 1 }, { unique: true });

export const GameSession = mongoose.model<IGameSession>('GameSession', gameSessionSchema);
