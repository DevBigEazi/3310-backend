import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import { MongoMemoryServer } from 'mongodb-memory-server';
import playerRoutes from '../routes/playerRoutes.js';
import scoreRoutes from '../routes/scoreRoutes.js';
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
    if (submitValidData.weeklyAccumulatedScore !== 40) {
      throw new Error(`Weekly score should be 40, got ${submitValidData.weeklyAccumulatedScore}`);
    }
    console.log('Verified lives decreased to 4 and weekly score increased to 40.');

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
