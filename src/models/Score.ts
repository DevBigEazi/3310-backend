import mongoose, { Document, Schema } from 'mongoose';

export interface IScore extends Document {
  playerAddress: string;
  score: number;
  gameSessionId: string;
  signature?: string;
  submittedAt: Date;
  weekNumber?: number;
  isValid: boolean;
  validationNotes?: string;
}

const scoreSchema = new Schema<IScore>({
  playerAddress: { type: String, required: true, lowercase: true },
  score: { type: Number, required: true },
  gameSessionId: { type: String, required: true, unique: true }, // Prevent replay attacks
  signature: String, // Backend signature
  submittedAt: { type: Date, default: Date.now },
  weekNumber: Number, // ISO week number for filtering
  isValid: { type: Boolean, default: true },
  validationNotes: String
});

export const Score = mongoose.model<IScore>('Score', scoreSchema);
