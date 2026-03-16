# Live Event Quiz Mode — Debug & Test

## Debug logging

Set in `.env` (or env):

- `REACT_APP_DEBUG_LIVE_QUIZ=true`

When enabled, the live quiz service logs:

- Quiz session created
- First question launched
- Question advanced / quiz completed
- Response submitted (uid, questionId, isCorrect, pointsAwarded)
- Quiz ended by host
- Quiz session cleared

## Manual test checklist

- [ ] Host starts a Live Event (or joins existing).
- [ ] Host clicks **Start Quiz** and sees modal with list of Training Grounds quizzes.
- [ ] Host selects a quiz, sets number of questions and time per question (e.g. 20s), clicks **Start Quiz**.
- [ ] Battle log shows "Quiz started: …".
- [ ] All players (including host) see the first question, prompt, image (if any), and answer options.
- [ ] Countdown timer is visible and decreases every second.
- [ ] Each player can select one or more options and click **Submit Answer**; first submission is accepted.
- [ ] After submit, player sees "Correct! — X points" or "Incorrect" and points.
- [ ] After timer ends, correct answer is highlighted (green); incorrect selection highlighted (red).
- [ ] Host sees "Answers: N / M" and **Next Question** / **Finish Quiz** / **End Quiz**.
- [ ] Host clicks **Next Question**; battle log shows "Next question (2/N)" and second question appears for everyone.
- [ ] Standings / mini leaderboard update after each question (scores and correct counts).
- [ ] After last question, host clicks **Finish Quiz**; battle log shows "Quiz completed!".
- [ ] Final standings leaderboard is shown; host can click **Close** to return to battle view.
- [ ] **End Quiz** (mid-quiz) ends early and shows completed state.
- [ ] Refresh or rejoin mid-quiz: player sees current question and can answer if time left; late answers rejected.
- [ ] Only one answer per player per question (resubmit rejected).
- [ ] Answers after timer ends are rejected (transaction returns error).
