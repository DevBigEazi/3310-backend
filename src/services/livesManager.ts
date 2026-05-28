import { GameSession, IGameSession } from '../models/GameSession.js';
import { getDayId, getWeekId } from '../utils/timeUtils.js';

export class LivesManager {
  /**
   * Refills lives if the countdown timer has expired.
   * If a new day has started, carries over the current state from the previous session in the same week.
   */
  public static async checkAndApplyRefill(playerAddress: string): Promise<IGameSession> {
    const today = getDayId();
    const currentWeek = getWeekId();
    let session = await GameSession.findOne({ playerAddress, dayId: today });
    
    if (!session) {
      // Find the most recent session for this player in the same week
      const lastSession = await GameSession.findOne({ 
        playerAddress, 
        weekNumber: currentWeek 
      }).sort({ dayId: -1 });
      
      let initialWeeklyScore = 0;
      let initialLives = 5;
      let initialNextRefillAt: Date | null = null;

      if (lastSession) {
        initialWeeklyScore = lastSession.weeklyAccumulatedScore;
        initialLives = lastSession.currentLives;
        initialNextRefillAt = lastSession.nextRefillAt;
      }

      session = new GameSession({ 
        playerAddress, 
        dayId: today, 
        weekNumber: currentWeek,
        weeklyAccumulatedScore: initialWeeklyScore,
        currentLives: initialLives,
        nextRefillAt: initialNextRefillAt
      });
      await session.save();
    }

    // Apply refill if timer expired
    if (session.currentLives < 5 && session.nextRefillAt && new Date() >= session.nextRefillAt) {
      session.currentLives = 5;
      session.nextRefillAt = null;
      await session.save();
    }
    
    return session;
  }

  /**
   * Consumes a single life and triggers the countdown timer if lives drop below capacity.
   */
  public static async consumeLife(playerAddress: string): Promise<IGameSession> {
    const session = await this.checkAndApplyRefill(playerAddress);
    
    if (session.currentLives <= 0) {
      throw new Error('OUT_OF_LIVES');
    }

    session.currentLives -= 1;
    // Start countdown if dropping from max capacity
    if (session.currentLives === 4) {
      session.nextRefillAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour wait
    }
    
    await session.save();
    return session;
  }
}
