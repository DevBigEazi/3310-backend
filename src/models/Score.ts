import { Schema, model, Document } from 'mongoose';

export interface IScore extends Document {
  playerAddress: string;
  score: number;
  dayId: string;               // YYYY-MM-DD
  weekId: number;              // Current week number since genesis
  isValid: boolean;
  createdAt: Date;
}

const ScoreSchema = new Schema<IScore>({
  playerAddress: { type: String, required: true, lowercase: true, index: true },
  score: { type: Number, required: true },
  dayId: { type: String, required: true },
  weekId: { type: Number, required: true, index: true },
  isValid: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

export const Score = model<IScore>('Score', ScoreSchema);
