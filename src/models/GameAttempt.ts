import { Schema, model, Document } from 'mongoose';

export interface IGameAttempt extends Document {
  gameSessionId: string;
  playerAddress: string;
  startTime: Date;
  isSubmitted: boolean;
  createdAt: Date;
}

const GameAttemptSchema = new Schema<IGameAttempt>({
  gameSessionId: { type: String, required: true, unique: true, index: true },
  playerAddress: { type: String, required: true, lowercase: true, index: true },
  startTime: { type: Date, required: true, default: Date.now },
  isSubmitted: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, default: Date.now, expires: 86400 * 7 } // TTL index to automatically clean up after 7 days
});

export const GameAttempt = model<IGameAttempt>('GameAttempt', GameAttemptSchema);
