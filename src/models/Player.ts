import { Schema, model, Document } from 'mongoose';

export interface IPlayer extends Document {
  address: string;             // Lowercased EIP-7702 delegated wallet address
  username: string;
  email?: string;
  createdAt: Date;
  referralCode: string;
  referredBy: string | null;
  referralPoints: number;
  referralCount: number;
  // Phase 2 backward compatibility placeholders
  isSubscribed: boolean;
  subscriptionExpiresAt: Date | null;
  lifetimeEarnings: number;
}

const PlayerSchema = new Schema<IPlayer>({
  address: { type: String, required: true, unique: true, lowercase: true, index: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, lowercase: true },
  createdAt: { type: Date, default: Date.now },
  referralCode: { type: String, required: true, unique: true, index: true },
  referredBy: { type: String, default: null, lowercase: true },
  referralPoints: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0, min: 0 },
  isSubscribed: { type: Boolean, default: false },
  subscriptionExpiresAt: { type: Date, default: null },
  lifetimeEarnings: { type: Number, default: 0 }
});

export const Player = model<IPlayer>('Player', PlayerSchema);
