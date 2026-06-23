import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import { MongoMemoryServer } from 'mongodb-memory-server';
import playerRoutes from '../routes/playerRoutes.js';
import scoreRoutes from '../routes/scoreRoutes.js';
import jwt from 'jsonwebtoken';
import { Player } from '../models/Player.js';
import { Score } from '../models/Score.js';
import { GameSession } from '../models/GameSession.js';
import { GameAttempt } from '../models/GameAttempt.js';

const TEST_PORT = 5001;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runTests() {
  console.log('--- Starting 3310 Backend Integration Tests ---');

  // 1. Setup Express Test Server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/player', playerRoutes);
  app.use('/api/scores', scoreRoutes);

  let server: any;
  let mongoServer: MongoMemoryServer | null = null;

  try {
    // 2. Connect to test in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    console.log('Connected to in-memory test MongoDB.');

    await Player.deleteMany({});
    await Score.deleteMany({});
    await GameSession.deleteMany({});
    await GameAttempt.deleteMany({});
    console.log('Cleared test database collections.');

    // Start server
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server running on port ${TEST_PORT}`);
    });

    // 3. Test Flow 1: Create Player A (Alice)
    console.log('\n[Test 1] Creating Player Alice...');
    const resAlice = await fetch(`${BASE_URL}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xAliceSmartAccountAddress0000000000001',
        username: 'alice_snake'
      })
    });
    
    const aliceData = await resAlice.json();
    if (resAlice.status !== 201) throw new Error(`Failed to create Alice: ${JSON.stringify(aliceData)}`);
    console.log('Alice registered successfully:', aliceData.player.username);
    console.log('Alice referral code:', aliceData.player.referralCode);
    const aliceToken = aliceData.token;

    // 4. Test Flow 2: Create Player B (Bob) referring Alice
    console.log('\n[Test 2] Creating Player Bob referring Alice...');
    const resBob = await fetch(`${BASE_URL}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xBobSmartAccountAddress000000000000002',
        username: 'bob_gamer',
        referredBy: aliceData.player.referralCode
      })
    });

    const bobData = await resBob.json();
    if (resBob.status !== 201) throw new Error(`Failed to create Bob: ${JSON.stringify(bobData)}`);
    console.log('Bob registered successfully with referral.');
    
    // Verify Bob points (should be 25)
    if (bobData.player.referralPoints !== 25) {
      throw new Error(`Bob referral points should be 25, got ${bobData.player.referralPoints}`);
    }
    console.log('Verified Bob referral points: 25');

    // Retrieve Alice profile to verify referrer points (should be 50) and count (should be 1)
    const resAliceProfile = await fetch(`${BASE_URL}/api/player/0xAliceSmartAccountAddress0000000000001`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const aliceProfileData = await resAliceProfile.json();
    if (aliceProfileData.player.referralPoints !== 50 || aliceProfileData.player.referralCount !== 1) {
      throw new Error(`Alice referral verification failed: ${JSON.stringify(aliceProfileData.player)}`);
    }
    console.log('Verified Alice referral points: 50, count: 1');

    // 5. Test Flow 3: Duplicate username check
    console.log('\n[Test 3] Testing duplicate username rejection...');
    const resDup = await fetch(`${BASE_URL}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xDupSmartAccountAddress000000000000003',
        username: 'alice_snake' // duplicate username
      })
    });
    const dupData = await resDup.json();
    if (resDup.status !== 400 || dupData.error !== 'USERNAME_TAKEN') {
      throw new Error(`Duplicate username check failed: status ${resDup.status}, error ${dupData.error}`);
    }
    console.log('Verified duplicate username is correctly rejected with USERNAME_TAKEN.');

    // 5b. Test Flow 3b: Unique email check
    console.log('\n[Test 3b] Testing unique email check...');
    // Register Player C with an email
    const resCharley = await fetch(`${BASE_URL}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xCharleySmartAccountAddress000000000004',
        username: 'charley_player',
        email: 'charley@example.com'
      })
    });
    const charleyData = await resCharley.json();
    if (resCharley.status !== 201) {
      throw new Error(`Failed to create Charley: ${JSON.stringify(charleyData)}`);
    }
    console.log('Charley registered successfully with email.');

    // Attempt to register Player D with the same email
    const resDave = await fetch(`${BASE_URL}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xDaveSmartAccountAddress00000000000005',
        username: 'dave_player',
        email: 'charley@example.com' // duplicate email
      })
    });
    const daveData = await resDave.json();
    if (resDave.status !== 400 || daveData.error !== 'EMAIL_TAKEN') {
      throw new Error(`Duplicate email check failed: status ${resDave.status}, error ${daveData.error}`);
    }
    console.log('Verified duplicate email is correctly rejected with EMAIL_TAKEN.');

    // 6. Test Flow 4: Get Game Session for Alice
    console.log('\n[Test 4] Retrieving Alice game session...');
    const resAliceSession = await fetch(`${BASE_URL}/api/scores/game-session`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const aliceSession = await resAliceSession.json();
    if (aliceSession.currentLives !== 5) {
      throw new Error(`Alice should start with 5 lives, got ${aliceSession.currentLives}`);
    }
    console.log('Verified Alice initial lives: 5/5');

    // 7. Test Flow 5: Start Game Attempt for Alice
    console.log('\n[Test 5] Starting game session for Alice...');
    const resStart = await fetch(`${BASE_URL}/api/scores/start`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    });
    const startData = await resStart.json();
    if (!startData.gameSessionId) {
      throw new Error(`Did not receive gameSessionId: ${JSON.stringify(startData)}`);
    }
    console.log('Game started. Received gameSessionId:', startData.gameSessionId);
    const gameSessionId1 = startData.gameSessionId;

    // 8. Test Flow 6: Submit Valid Score
    console.log('\n[Test 6] Submitting a valid score (score=40 after waiting 1s)...');
    // Wait 1 second to make score valid (40 score / 1.0s = 40 pts/sec <= 50 limit)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const resSubmitValid = await fetch(`${BASE_URL}/api/scores/validate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        gameSessionId: gameSessionId1,
        score: 40
      })
    });
    const submitValidData = await resSubmitValid.json();
    if (resSubmitValid.status !== 200 || !submitValidData.isValid) {
      throw new Error(`Score submission failed or marked invalid: ${JSON.stringify(submitValidData)}`);
    }
    console.log('Score validated successfully!');
    console.log('Alice updated lives:', submitValidData.currentLives);
    console.log('Alice weekly accumulated score:', submitValidData.weeklyAccumulatedScore);
    
    if (submitValidData.currentLives !== 4) {
      throw new Error(`Lives should be 4, got ${submitValidData.currentLives}`);
    }
    if (submitValidData.nextRefillAt !== null) {
      throw new Error(`nextRefillAt should be null at 4 lives, got ${submitValidData.nextRefillAt}`);
    }
    console.log('Verified nextRefillAt is null when lives are above 0.');
    if (submitValidData.weeklyAccumulatedScore !== 40) {
      throw new Error(`Weekly score should be 40, got ${submitValidData.weeklyAccumulatedScore}`);
    }
    console.log('Verified lives decreased to 4 and weekly score increased to 40.');

    // 8b. Test Flow 6b: Submit score of 0 (no loss restart)
    console.log('\n[Test 6b] Testing submit score of 0 (no-loss restart)...');
    // Start game 1.5
    const resStartNoLoss = await fetch(`${BASE_URL}/api/scores/start`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    });
    const startNoLossData = await resStartNoLoss.json();
    const gameSessionIdNoLoss = startNoLossData.gameSessionId;

    // Submit score of 0
    const resSubmitNoLoss = await fetch(`${BASE_URL}/api/scores/validate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        gameSessionId: gameSessionIdNoLoss,
        score: 0
      })
    });
    const submitNoLossData = await resSubmitNoLoss.json();
    if (resSubmitNoLoss.status !== 200) {
      throw new Error(`Score 0 submission failed: ${JSON.stringify(submitNoLossData)}`);
    }
    // Lives should still be 4!
    if (submitNoLossData.currentLives !== 4) {
      throw new Error(`Lives should remain 4, got ${submitNoLossData.currentLives}`);
    }
    console.log('Verified score 0 does not consume a life and lives remain at 4.');

    // 9. Test Flow 7: Submit Cheat Score
    console.log('\n[Test 7] Testing anti-cheat validation with high score-to-time ratio...');
    // Start game 2
    const resStart2 = await fetch(`${BASE_URL}/api/scores/start`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${aliceToken}`
      }
    });
    const start2Data = await resStart2.json();
    const gameSessionId2 = start2Data.gameSessionId;

    // Submit immediately (e.g. score=150 in 0.1s -> 1500 pts/sec > 50 limit)
    const resSubmitCheat = await fetch(`${BASE_URL}/api/scores/validate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        gameSessionId: gameSessionId2,
        score: 150
      })
    });
    const submitCheatData = await resSubmitCheat.json();
    if (submitCheatData.isValid) {
      throw new Error('Cheat score was incorrectly validated as true');
    }
    console.log('Verified cheat score correctly caught and marked isValid: false');
    console.log('Lives count after cheat game:', submitCheatData.currentLives);
    console.log('Weekly score after cheat game:', submitCheatData.weeklyAccumulatedScore);
    
    if (submitCheatData.currentLives !== 3) {
      throw new Error(`Lives should be 3, got ${submitCheatData.currentLives}`);
    }
    if (submitCheatData.weeklyAccumulatedScore !== 40) {
      throw new Error(`Weekly score should have remained 40, got ${submitCheatData.weeklyAccumulatedScore}`);
    }
    console.log('Verified lives decreased to 3 and invalid score did not add to weekly total.');

    // 10. Test Flow 8: Replay Attack Verification
    console.log('\n[Test 8] Testing replay attack protection...');
    const resReplay = await fetch(`${BASE_URL}/api/scores/validate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        gameSessionId: gameSessionId2, // reusing the same session ID
        score: 10
      })
    });
    const replayData = await resReplay.json();
    if (resReplay.status !== 400 || replayData.error !== 'INVALID_OR_SUBMITTED_SESSION') {
      throw new Error(`Replay attack wasn't blocked: status ${resReplay.status}, error ${replayData.error}`);
    }
    console.log('Verified replay attempt blocked successfully with INVALID_OR_SUBMITTED_SESSION.');

    // 11. Test Flow 9: Hourly Game Play Limits
    console.log('\n[Test 9] Testing hourly play limits (Max 5 games/hr)...');
    // Alice has played 2 games so far (1 valid, 1 invalid).
    // Let's play 3 more games to reach the limit of 5.
    for (let i = 0; i < 3; i++) {
      const resStartI = await fetch(`${BASE_URL}/api/scores/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const startIData = await resStartI.json();
      if (resStartI.status !== 200) {
        throw new Error(`Failed to start game ${i + 3}: ${JSON.stringify(startIData)}`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 100)); // small delay

      const resSubmitI = await fetch(`${BASE_URL}/api/scores/validate-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          gameSessionId: startIData.gameSessionId,
          score: 2
        })
      });
      const submitIData = await resSubmitI.json();
      console.log(`Game ${i + 3} submitted. Lives remaining: ${submitIData.currentLives}, games played in hour: ${submitIData.gamesPlayedInCurrentHour}`);
      
      // On the 5th game (i === 2), lives drop to 0. Verify nextRefillAt is set.
      if (i === 2) {
        if (submitIData.currentLives !== 0) {
          throw new Error(`Lives should be 0 on 5th game, got ${submitIData.currentLives}`);
        }
        if (!submitIData.nextRefillAt) {
          throw new Error(`nextRefillAt should be set when lives drop to 0`);
        }
        console.log('Verified nextRefillAt is successfully set when lives drop to 0.');
      } else {
        if (submitIData.nextRefillAt !== null) {
          throw new Error(`nextRefillAt should be null when lives are above 0, got ${submitIData.nextRefillAt}`);
        }
      }
    }

    // To test the hourly limit, we need to bypass the out-of-lives check.
    // Let's directly restore Alice's lives in the database to 5.
    const today = new Date().toISOString().split('T')[0];
    await GameSession.updateOne(
      { playerAddress: '0xAliceSmartAccountAddress0000000000001'.toLowerCase(), dayId: today },
      { $set: { currentLives: 5 } }
    );
    console.log('Restored Alice lives to 5 in DB for hourly limit test.');

    // Attempting the 6th game start (limit is 5)
    console.log('Attempting 6th game in the current hour...');
    const resLimitStart = await fetch(`${BASE_URL}/api/scores/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const limitStartData = await resLimitStart.json();
    if (resLimitStart.status !== 400 || limitStartData.error !== 'HOUR_LIMIT_REACHED') {
      throw new Error(`Hourly limit not enforced: status ${resLimitStart.status}, error ${limitStartData.error}`);
    }
    console.log('Verified 6th game start blocked successfully with HOUR_LIMIT_REACHED.');

    // 12. Test Flow 10: Weekly Leaderboard Query
    console.log('\n[Test 10] Testing weekly leaderboard sorting...');
    
    // Create Bob's scores. Bob has 25 referral points.
    // Let's register Bob's score session and play a game.
    // Bob logs in
    const resBobLogin = await fetch(`${BASE_URL}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0xBobSmartAccountAddress000000000000002',
        username: 'bob_gamer'
      })
    });
    const bobLoginData = await resBobLogin.json();
    const bobToken = bobLoginData.token;

    // Bob starts a game
    const resBobStart = await fetch(`${BASE_URL}/api/scores/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${bobToken}` }
    });
    const bobStartData = await resBobStart.json();

    // Bob submits score=46 (valid)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const resBobSubmit = await fetch(`${BASE_URL}/api/scores/validate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobToken}`
      },
      body: JSON.stringify({
        gameSessionId: bobStartData.gameSessionId,
        score: 46
      })
    });
    const bobSubmitData = await resBobSubmit.json();
    console.log(`Bob game submitted. Score: ${bobSubmitData.score}, Weekly Accumulated: ${bobSubmitData.weeklyAccumulatedScore}`);

    // Query Weekly Leaderboard
    const resLeaderboard = await fetch(`${BASE_URL}/api/scores/leaderboard/weekly`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const leaderboardData = await resLeaderboard.json();
    
    console.log('\nWeekly Leaderboard Results:');
    leaderboardData.leaderboard.forEach((entry: any, index: number) => {
      console.log(`${index + 1}. ${entry.username} - Score: ${entry.weeklyScore}, Games: ${entry.gamesCount}, Referral Points: ${entry.referralPoints}`);
    });

    // Check rankings:
    // Bob should be #1 (Weekly Score = 46)
    // Alice should be #2 (Weekly Score = 46? Wait, Alice got 40 in game 1, and 2 in game 3, 2 in game 4, 2 in game 5. Total Alice score = 46!)
    // Wait! If both have score 46, who is ranked higher?
    // Tiebreaker sorting: Weekly Score (Desc) -> Games Played (Asc) -> Referral Points (Desc)
    // Bob games played = 1. Alice games played = 5.
    // So Bob games (1) < Alice games (5). Bob wins tiebreaker!
    // Let's verify Bob is index 0 and Alice is index 1.
    const first = leaderboardData.leaderboard[0];
    const second = leaderboardData.leaderboard[1];
    
    if (first.username !== 'bob_gamer' || second.username !== 'alice_snake') {
      throw new Error(`Leaderboard sorting failed. Expected Bob #1, Alice #2. Got: 1st ${first.username}, 2nd ${second.username}`);
    }
    console.log('Verified tiebreaker sorting: Bob #1 (fewer games played), Alice #2.');

    // 13. Test Flow 11: All-Time Leaderboard and Profile cumulative score
    console.log('\n[Test 11] Testing All-Time Leaderboard and Profile cumulative score...');
    // Query All-Time Leaderboard
    const resAllTime = await fetch(`${BASE_URL}/api/scores/leaderboard/all-time`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const allTimeData = await resAllTime.json();
    
    console.log('All-Time Leaderboard Results:');
    allTimeData.leaderboard.forEach((entry: any, index: number) => {
      console.log(`${index + 1}. ${entry.username} - Score: ${entry.highScore}, Games: ${entry.totalGames}`);
    });

    const aliceEntry = allTimeData.leaderboard.find((entry: any) => entry.username === 'alice_snake');
    const bobEntry = allTimeData.leaderboard.find((entry: any) => entry.username === 'bob_gamer');

    if (!aliceEntry || aliceEntry.highScore !== 46) {
      throw new Error(`Alice's all-time score should be 46 (cumulative), got ${aliceEntry?.highScore}`);
    }
    if (!bobEntry || bobEntry.highScore !== 46) {
      throw new Error(`Bob's all-time score should be 46 (cumulative), got ${bobEntry?.highScore}`);
    }
    console.log('Verified All-Time Leaderboard uses cumulative scores.');

    // Query Alice profile stats
    const resAliceProfile2 = await fetch(`${BASE_URL}/api/player/0xAliceSmartAccountAddress0000000000001`, {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const aliceProfileData2 = await resAliceProfile2.json();
    if (aliceProfileData2.stats.highestScore !== 46) {
      throw new Error(`Alice profile highestScore should be 46 (cumulative), got ${aliceProfileData2.stats.highestScore}`);
    }
    console.log('Verified Profile stats uses cumulative score.');

    // 14. Test Flow 12: Weekly Rank Badges Resolution and Rules
    console.log('\n[Test 12] Testing weekly leaderboard resolution and rank badges...');
    
    // Clear collections first to have clean rankings
    await Player.deleteMany({});
    await Score.deleteMany({});
    
    // Re-create Alice so we still have a valid token/session
    const alice = new Player({
      address: '0xAliceSmartAccountAddress0000000000001'.toLowerCase(),
      username: 'alice_snake',
      referralCode: 'ALICE1',
      referralPoints: 10
    });
    await alice.save();

    // Create 10 players (player_1 to player_10)
    const testPlayers = [];
    for (let i = 1; i <= 10; i++) {
      const p = new Player({
        address: `0xPlayerAddress000000000000000000000${i}`.toLowerCase(),
        username: `player_${i}`,
        referralCode: `REFCODE${i}`,
        referralPoints: 0
      });
      await p.save();
      testPlayers.push(p);

      // Create a valid score for week 1
      const scoreVal = (11 - i) * 10; // player_1 score=100, player_2 score=90, etc.
      const s = new Score({
        playerAddress: p.address,
        score: scoreVal,
        dayId: '2026-06-01',
        weekId: 1,
        isValid: true
      });
      await s.save();
    }

    // First, assert that a non-admin (Alice) gets rejected with 403 Forbidden
    console.log('Verifying resolve endpoint rejects non-admin users...');
    const resResolveForbidden = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ weekId: 1 })
    });
    const forbiddenData = await resResolveForbidden.json();
    if (resResolveForbidden.status !== 403 || forbiddenData.error !== 'FORBIDDEN') {
      throw new Error(`Expected 403 FORBIDDEN for non-admin resolve request, got status ${resResolveForbidden.status}: ${JSON.stringify(forbiddenData)}`);
    }
    console.log('Verified non-admin resolve request is blocked with 403 FORBIDDEN.');

    // Sign an admin token
    const adminToken = jwt.sign(
      { address: '0xAdminSmartAccountAddress0000000000001', role: 'admin' },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '30d' }
    );

    // Call the resolve endpoint for week 1
    const resResolveWeek1 = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ weekId: 1 })
    });
    const resolveWeek1Data = await resResolveWeek1.json();
    if (resResolveWeek1.status !== 200 || !resolveWeek1Data.success) {
      throw new Error(`Failed to resolve week 1 leaderboard: ${JSON.stringify(resolveWeek1Data)}`);
    }
    console.log('Leaderboard resolution API for week 1 completed successfully with admin credentials.');

    // Call the resolve endpoint for week 1 again to test idempotency/duplicate checks
    console.log('Running week 1 resolution again to verify duplicate badge prevention...');
    const resResolveWeek1Dup = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ weekId: 1 })
    });
    const resolveWeek1DupData = await resResolveWeek1Dup.json();
    if (resResolveWeek1Dup.status !== 200 || !resolveWeek1DupData.success) {
      throw new Error(`Failed to run duplicate week 1 leaderboard resolution: ${JSON.stringify(resolveWeek1DupData)}`);
    }
    console.log('Second leaderboard resolution API call for week 1 completed successfully.');

    // Fetch and check badges for player_1 to player_10
    for (let i = 1; i <= 10; i++) {
      const pAddress = `0xPlayerAddress000000000000000000000${i}`.toLowerCase();
      const resProfile = await fetch(`${BASE_URL}/api/player/${pAddress}`, {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const profileData = await resProfile.json();
      const badges = profileData.player.badges || [];
      const badgeTypes = badges.map((b: any) => b.badgeType);

      console.log(`Checking badges for player_${i} (Rank ${i}):`, badgeTypes);

      if (i === 1) {
        const countFirst = badges.filter((b: any) => b.badgeType === 'FIRST_PLACE').length;
        const countTop5 = badges.filter((b: any) => b.badgeType === 'TOP_5').length;
        const countTop10 = badges.filter((b: any) => b.badgeType === 'TOP_10').length;
        const countGoat = badges.filter((b: any) => b.badgeType === 'GOAT').length;
        if (countFirst !== 1 || countTop5 !== 1 || countTop10 !== 1 || countGoat !== 1) {
          throw new Error(`player_1 (Rank 1) badge counts incorrect. Expected exactly 1 of each. Got: FIRST_PLACE=${countFirst}, TOP_5=${countTop5}, TOP_10=${countTop10}, GOAT=${countGoat}`);
        }
      } else {
        const countGoat = badges.filter((b: any) => b.badgeType === 'GOAT').length;
        if (countGoat !== 0) {
          throw new Error(`player_${i} should not have GOAT badge in week 1, got ${countGoat}`);
        }
      }

      if (i === 2) {
        const countSecond = badges.filter((b: any) => b.badgeType === 'SECOND_PLACE').length;
        const countTop5 = badges.filter((b: any) => b.badgeType === 'TOP_5').length;
        const countTop10 = badges.filter((b: any) => b.badgeType === 'TOP_10').length;
        if (countSecond !== 1 || countTop5 !== 1 || countTop10 !== 1) {
          throw new Error(`player_2 (Rank 2) badge counts incorrect. Expected exactly 1 of each. Got: SECOND_PLACE=${countSecond}, TOP_5=${countTop5}, TOP_10=${countTop10}`);
        }
      } else if (i === 3) {
        const countThird = badges.filter((b: any) => b.badgeType === 'THIRD_PLACE').length;
        const countTop5 = badges.filter((b: any) => b.badgeType === 'TOP_5').length;
        const countTop10 = badges.filter((b: any) => b.badgeType === 'TOP_10').length;
        if (countThird !== 1 || countTop5 !== 1 || countTop10 !== 1) {
          throw new Error(`player_3 (Rank 3) badge counts incorrect. Expected exactly 1 of each. Got: THIRD_PLACE=${countThird}, TOP_5=${countTop5}, TOP_10=${countTop10}`);
        }
      } else if (i === 4 || i === 5) {
        if (badgeTypes.includes('FIRST_PLACE') || badgeTypes.includes('SECOND_PLACE') || badgeTypes.includes('THIRD_PLACE')) {
          throw new Error(`player_${i} should not have place badges. Got: ${JSON.stringify(badgeTypes)}`);
        }
        if (!badgeTypes.includes('TOP_5') || !badgeTypes.includes('TOP_10')) {
          throw new Error(`player_${i} (Rank ${i}) missing top5/top10. Got: ${JSON.stringify(badgeTypes)}`);
        }
      } else if (i >= 6 && i <= 10) {
        if (badgeTypes.includes('FIRST_PLACE') || badgeTypes.includes('SECOND_PLACE') || badgeTypes.includes('THIRD_PLACE') || badgeTypes.includes('TOP_5')) {
          throw new Error(`player_${i} should not have top place/top5 badges. Got: ${JSON.stringify(badgeTypes)}`);
        }
        if (!badgeTypes.includes('TOP_10')) {
          throw new Error(`player_${i} (Rank ${i}) missing top10. Got: ${JSON.stringify(badgeTypes)}`);
        }
      }
    }
    console.log('Verified week 1 badge assignment matches ranks successfully.');

    // Now test repeatability and one-time constraints in week 2
    console.log('Testing week 2 badge resolution (repeatable place badges vs one-time badges)...');
    
    // Add scores for week 2:
    // player_1 (address 1) scores 100 -> Rank 1
    // player_2 (address 2) scores 90 -> Rank 2
    const s2_1 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000001`.toLowerCase(),
      score: 100,
      dayId: '2026-06-08',
      weekId: 2,
      isValid: true
    });
    await s2_1.save();

    const s2_2 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000002`.toLowerCase(),
      score: 90,
      dayId: '2026-06-08',
      weekId: 2,
      isValid: true
    });
    await s2_2.save();

    // Call the resolve endpoint for week 2
    const resResolveWeek2 = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ weekId: 2 })
    });
    const resolveWeek2Data = await resResolveWeek2.json();
    if (resResolveWeek2.status !== 200 || !resolveWeek2Data.success) {
      throw new Error(`Failed to resolve week 2 leaderboard: ${JSON.stringify(resolveWeek2Data)}`);
    }

    // Verify player_1 badges: should have 2 FIRST_PLACE, 1 TOP_5, 1 TOP_10, and 1 GOAT
    const resProfile1 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000001`.toLowerCase(), {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const profile1Data = await resProfile1.json();
    const badges1 = profile1Data.player.badges || [];
    const countFirstPlace1 = badges1.filter((b: any) => b.badgeType === 'FIRST_PLACE').length;
    const countTop5_1 = badges1.filter((b: any) => b.badgeType === 'TOP_5').length;
    const countTop10_1 = badges1.filter((b: any) => b.badgeType === 'TOP_10').length;
    const countGoat1 = badges1.filter((b: any) => b.badgeType === 'GOAT').length;

    console.log('Player 1 final badge counts:', { countFirstPlace1, countTop5_1, countTop10_1, countGoat1 });

    if (countFirstPlace1 !== 2) {
      throw new Error(`player_1 should have 2 FIRST_PLACE badges, got ${countFirstPlace1}`);
    }
    if (countTop5_1 !== 1) {
      throw new Error(`player_1 should have exactly 1 TOP_5 badge, got ${countTop5_1}`);
    }
    if (countTop10_1 !== 1) {
      throw new Error(`player_1 should have exactly 1 TOP_10 badge, got ${countTop10_1}`);
    }
    if (countGoat1 !== 1) {
      throw new Error(`player_1 should still hold the GOAT badge in week 2, got ${countGoat1}`);
    }

    // Verify player_2 badges: should have 2 SECOND_PLACE, 1 TOP_5, 1 TOP_10, and 0 GOAT
    const resProfile2 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000002`.toLowerCase(), {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const profile2Data = await resProfile2.json();
    const badges2 = profile2Data.player.badges || [];
    const countSecondPlace2 = badges2.filter((b: any) => b.badgeType === 'SECOND_PLACE').length;
    const countTop5_2 = badges2.filter((b: any) => b.badgeType === 'TOP_5').length;
    const countTop10_2 = badges2.filter((b: any) => b.badgeType === 'TOP_10').length;
    const countGoat2 = badges2.filter((b: any) => b.badgeType === 'GOAT').length;

    console.log('Player 2 final badge counts:', { countSecondPlace2, countTop5_2, countTop10_2, countGoat2 });

    if (countSecondPlace2 !== 2) {
      throw new Error(`player_2 should have 2 SECOND_PLACE badges, got ${countSecondPlace2}`);
    }
    if (countTop5_2 !== 1) {
      throw new Error(`player_2 should have exactly 1 TOP_5 badge, got ${countTop5_2}`);
    }
    if (countTop10_2 !== 1) {
      throw new Error(`player_2 should have exactly 1 TOP_10 badge, got ${countTop10_2}`);
    }
    if (countGoat2 !== 0) {
      throw new Error(`player_2 should not hold GOAT badge in week 2, got ${countGoat2}`);
    }

    console.log('Verified repeatability and one-time constraints successfully!');

    // --- GOAT Badge Transfer Tests ---
    console.log('\nTesting GOAT badge transfer mechanics across week 3, 4, 5...');

    // Week 3: Player 2 wins. Score P2=100 (1st Place), P1=50 (2nd Place).
    // Weekly championships total: Player 1 = 2 wins, Player 2 = 1 win.
    // Result: Player 1 should keep GOAT (2 > 1).
    const s3_1 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000001`.toLowerCase(),
      score: 50,
      dayId: '2026-06-15',
      weekId: 3,
      isValid: true
    });
    await s3_1.save();

    const s3_2 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000002`.toLowerCase(),
      score: 100,
      dayId: '2026-06-15',
      weekId: 3,
      isValid: true
    });
    await s3_2.save();

    const resResolveWeek3 = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ weekId: 3 })
    });
    if (resResolveWeek3.status !== 200) {
      throw new Error(`Failed to resolve week 3: ${resResolveWeek3.status}`);
    }

    // Verify Player 1 retains GOAT
    const p1w3 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000001`.toLowerCase(), { headers: { 'Authorization': `Bearer ${aliceToken}` } }).then(r => r.json());
    const p2w3 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000002`.toLowerCase(), { headers: { 'Authorization': `Bearer ${aliceToken}` } }).then(r => r.json());
    if (p1w3.player.badges.filter((b: any) => b.badgeType === 'GOAT').length !== 1) {
      throw new Error('Player 1 should keep GOAT in week 3 (2 wins vs 1 win).');
    }
    if (p2w3.player.badges.filter((b: any) => b.badgeType === 'GOAT').length !== 0) {
      throw new Error('Player 2 should not have GOAT in week 3.');
    }
    console.log('Week 3: Verified Player 1 retains GOAT badge (2 wins vs 1 win).');

    // Week 4: Player 2 wins again. Score P2=100 (1st Place), P1=50 (2nd Place).
    // Weekly championships total: Player 1 = 2 wins, Player 2 = 2 wins.
    // Result: Tie! Player 1 should keep GOAT (tiebreaker favors existing holder).
    const s4_1 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000001`.toLowerCase(),
      score: 50,
      dayId: '2026-06-22',
      weekId: 4,
      isValid: true
    });
    await s4_1.save();

    const s4_2 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000002`.toLowerCase(),
      score: 100,
      dayId: '2026-06-22',
      weekId: 4,
      isValid: true
    });
    await s4_2.save();

    const resResolveWeek4 = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ weekId: 4 })
    });
    if (resResolveWeek4.status !== 200) {
      throw new Error(`Failed to resolve week 4: ${resResolveWeek4.status}`);
    }

    // Verify Player 1 retains GOAT in tie
    const p1w4 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000001`.toLowerCase(), { headers: { 'Authorization': `Bearer ${aliceToken}` } }).then(r => r.json());
    const p2w4 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000002`.toLowerCase(), { headers: { 'Authorization': `Bearer ${aliceToken}` } }).then(r => r.json());
    if (p1w4.player.badges.filter((b: any) => b.badgeType === 'GOAT').length !== 1) {
      throw new Error('Player 1 should keep GOAT in week 4 tie (2 wins vs 2 wins, favors existing holder).');
    }
    if (p2w4.player.badges.filter((b: any) => b.badgeType === 'GOAT').length !== 0) {
      throw new Error('Player 2 should not have GOAT in week 4 tie.');
    }
    console.log('Week 4: Verified Player 1 retains GOAT badge in tie (2 wins vs 2 wins).');

    // Week 5: Player 2 wins again. Score P2=100 (1st Place), P1=50 (2nd Place).
    // Weekly championships total: Player 1 = 2 wins, Player 2 = 3 wins.
    // Result: Player 2 takes the lead! GOAT badge should transfer from Player 1 to Player 2.
    const s5_1 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000001`.toLowerCase(),
      score: 50,
      dayId: '2026-06-29',
      weekId: 5,
      isValid: true
    });
    await s5_1.save();

    const s5_2 = new Score({
      playerAddress: `0xPlayerAddress0000000000000000000002`.toLowerCase(),
      score: 100,
      dayId: '2026-06-29',
      weekId: 5,
      isValid: true
    });
    await s5_2.save();

    const resResolveWeek5 = await fetch(`${BASE_URL}/api/scores/leaderboard/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ weekId: 5 })
    });
    if (resResolveWeek5.status !== 200) {
      throw new Error(`Failed to resolve week 5: ${resResolveWeek5.status}`);
    }

    // Verify GOAT has transferred to Player 2
    const p1w5 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000001`.toLowerCase(), { headers: { 'Authorization': `Bearer ${aliceToken}` } }).then(r => r.json());
    const p2w5 = await fetch(`${BASE_URL}/api/player/0xPlayerAddress0000000000000000000002`.toLowerCase(), { headers: { 'Authorization': `Bearer ${aliceToken}` } }).then(r => r.json());
    if (p1w5.player.badges.filter((b: any) => b.badgeType === 'GOAT').length !== 0) {
      throw new Error('GOAT badge was not removed from Player 1 after being overtaken.');
    }
    if (p2w5.player.badges.filter((b: any) => b.badgeType === 'GOAT').length !== 1) {
      throw new Error('GOAT badge was not transferred to Player 2 (3 wins vs 2 wins).');
    }
    console.log('Week 5: Verified GOAT badge successfully transferred to Player 2 (3 wins vs 2 wins).');

    console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
  } catch (err: any) {
    console.error('\n❌ Test failed:', err.message || err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
      console.log('Closed test Express server.');
    }
    await mongoose.disconnect();
    console.log('Disconnected from test MongoDB.');
    if (mongoServer) {
      await mongoServer.stop();
      console.log('Stopped in-memory test MongoDB server.');
    }
    process.exit(0);
  }
}

runTests();
