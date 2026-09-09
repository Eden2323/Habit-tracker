# Using the tracker

Day-to-day guide. For what the app is, how to install it and how it is built,
see the [README](../README.md).

## Getting started

Open the app, go to **Settings**, and spend two minutes on three things.

**1. Start date.** *Settings → Start date.* By default Day 1 is the day you
first opened the app. If you started the challenge earlier in the week, set the
real date — anything you have already logged stays on the date you logged it,
only the day numbers around it shift. The date has to be in the past and within
the last 75 days.

**2. Your rules.** *Settings → Your rules.* The five rules come preloaded.
Tap one to open it and you can change its name, its small note, its icon and
its target — 2,000 ml of water, 10 pages, 45 minutes. The switch on the right
takes a rule out of the challenge entirely; built-in rules switch off but never
delete, so the days you already logged against them keep their names. Custom
habits you add can be deleted outright. Use the move buttons to put them in the
order you actually do them. One rule always has to stay on.

> Days are scored against the rules as they are **right now**, not as they were
> when you logged them. Raise a target and a day you had already finished can
> un-tick itself. Get the rules right early.

**3. Macro targets.** *Settings → Macro targets.* Calories, protein, carbs and
fat. The app adds up what your grams are worth in calories and tells you when
that disagrees with your calorie target, with a one-tap fix. A target of 0
switches that number off in the day's tracker.

While you are there: **Water** sets the glass size (200 / 250 / 330 / 500 ml, or
type your own), and **Appearance** sets light, dark or follow-the-phone.

## The daily loop

The **Today** tab is the whole thing: a ring showing how many rules are done,
and the list underneath.

Two ways to interact with each row:

- **The checkbox on the left** ticks the rule off directly.
- **The rest of the row** opens that rule's tracker.

The header shows which day you are on and has arrows for moving between days,
plus a **Today** button to come back. You can walk back as far as Day 1 to fill
in something you forgot; you cannot go into the future.

### Water

Glasses across the top, each one the size you set in Settings. Tap the fourth
glass and the day jumps to four glasses' worth. Tap the glass that already
matches your total and it empties back one — so an overshoot costs one tap, not
a trip to the keypad. Underneath, − and + move by one glass, and **Custom
amount** adds an odd bottle (a 330 ml can, say). **Clear water** zeroes the day.

### Workout

Drag the slider or tap one of the common lengths (30 / 45 / 60 / 75 / 90). The
marker on the track is your target. Below that: a minutes box if you want to
type an exact number, a free-text field for what you did, and an **Outdoors**
switch. It saves a moment after you stop moving or typing.

### Macros

Type protein, carbs and fat. The ring shows how the day splits and what those
grams come to in calories; tap the suggestion under Calories to accept that
number rather than typing it. Each row has a bar against your target, and shows
what is left — or by how much you went over.

**Numbers alone do not tick the rule.** Press **Mark macros logged** at the
bottom once the food is actually in for the day. That is what completes it, and
you can turn it back off if the day is not done with you yet.

### Reading

The stepper counts pages; **+5** and **+10** are there for the common case.
Put the book's title in the **Book** field — titles you have used before
autocomplete, and if you were reading something yesterday the app offers it as
**Still reading**, which it will not fill in for you until you tap it. At the
bottom: pages for the whole attempt, and pages for the book you are on.

### Progress photo

On today, **Take today's photo** opens the camera straight away. On a past day
it opens your library instead, so you can pick a shot you already took. The
photo is scaled down and saved on the device; you can **Replace** or **Delete**
it any time. Same spot, same light, same time of day — that is what makes the
compare view worth anything on day 75.

### The note

At the bottom of every day. Tap **Add a note**, type, and it saves as you go.
Useful for the *why*: what was hard, what you slept, what you ate that ruined
you.

## Ticking things by hand

Trackers cannot see everything. You swam for an hour and never opened the app;
you drank from a bottle you never counted. So the checkbox always wins over the
tracker, in both directions.

- **Tick a rule the tracker thinks is unfinished** and it counts as done. The
  row gets a small **manual** badge.
- **Un-tick a rule the tracker thinks is done** and it stays open. Same badge.
  Use this when the number went in by accident, or when you logged 45 minutes
  but you know it does not count.

To hand control back, open the row and press **Use tracker** — the override is
dropped and the rule goes back to being scored on its numbers. Setting a rule
back to whatever the tracker already thinks does the same thing automatically,
so the badge disappears on its own once the two agree.

A day is complete when every rule that is switched on is done, by tracker or by
hand.

## When you miss a day

The rule of 75 Hard is that a missed day sends you back to Day 1. The app will
not do that to you quietly.

**What you see.** Once a day is fully in the past and was left incomplete, a
banner appears at the top of every tab: which day it was, and which rules came
up short. Today is never treated as a failure while it is still today.

**What you can do.**

- **Go back and finish it.** Use the header arrows to open that day and log what
  you actually did, or tick it off by hand. If the day becomes complete, the
  banner goes away and nothing was lost.
- **Not yet.** Puts the banner away for the rest of the day and leaves a small
  chip with a Restart button on it. The app stays fully usable while you decide.
- **Restart at Day 1.** Asks you to confirm on a screen that spells out exactly
  what happens. Nothing resets until you tap the second button.

**What a restart does.**

| | |
| --- | --- |
| **Kept** | The whole attempt moves to *Settings → Previous attempts*: how far you got, days complete, best streak, every photo, note and number. |
| **Reset** | The counter. Today becomes Day 1 and the board starts empty. |
| **Carried over** | Your rules and macro targets, exactly as they are. |

Nothing restarts by itself. No timer, no overnight job — a missed day only ever
produces a prompt.

There is also a manual restart in **Settings → Danger zone**, for when you want
to start over on your own terms. It needs a checkbox ticked and a button
pressed, and it archives the same way.

**Finishing all 75** brings up the same banner in a friendlier mood: archive the
run to file it in your history and start a fresh Day 1, or leave it alone and
keep looking through it.

## Backups

The log lives in this browser on this phone and nowhere else. A backup is the
only copy that exists anywhere.

**Export.** *Settings → Your data → Download backup.* You get one file,
`75hard-backup-YYYY-MM-DD.json`, containing your days, rules, targets, archived
attempts **and every photo**. On iOS it lands in Files — move it to iCloud
Drive, Google Drive or anywhere off the phone. That is the whole point.

There is also **Copy backup to clipboard**, for browsers that block downloads.
It only works for small backups (once you have a few weeks of photos the file is
too big to paste) and needs a secure connection.

**When to do it.**

- Once a week. It takes five seconds.
- **Before clearing your browsing data, cache or site data** — that is what
  deletes the challenge.
- Before changing phones or browsers.
- Before restoring a backup, so you can get back to where you were.

**Restore.** *Settings → Your data → Restore from backup*, pick the file, and
confirm. Read the confirmation screen: **restoring does not merge.** Everything
currently on the device is thrown away and the file takes its place. Photos
already on the device are left alone, so a day whose picture was missing from
the file may still find it.

## Photos

The **Photos** tab has two modes.

**Timeline** is the grid: every day you captured, in order, with its day number.
Tap one to open it full screen, then swipe left and right (or use the arrow
keys) to walk through them. Escape closes it.

**Compare** is the point of taking them. Pick a **Before** and an **After** from
the two dropdowns, then choose a layout:

- **Wipe** puts both photos in one frame with a divider you drag across. Arrow
  keys nudge it if dragging one-handed is fiddly.
- **Side by side** shows them as a pair.

Photos never leave the device. They are not uploaded, not synced, and not
included in anything the app sends anywhere, because the app does not send
anything anywhere. That has a cost: they exist in exactly one place, so a
deleted photo is gone for good and a lost phone is a lost album. The backup file
is the only way to carry them somewhere else.

## Troubleshooting

### "My progress vanished"

The app can only read what this exact browser, on this exact device, stored. In
rough order of likelihood:

- **Site data was cleared.** Clearing history, cache or site data in the browser
  wipes localStorage and IndexedDB. There is no recovery from this except a
  backup file.
- **You are in a different browser.** Safari and Chrome on the same phone are
  two separate boxes of data. The installed home-screen app and the same
  browser's tabs do share storage.
- **You are in a private / incognito window.** Nothing survives the window
  closing. The app shows an orange strip saying *Nothing is being saved* when it
  detects this — if you saw that strip, that was why.
- **It is a different device.** There is no account and no sync, by design.

If you have a backup file: *Settings → Your data → Restore from backup*.

### "A day I had finished has un-ticked itself"

You changed a rule. Days are scored live against current targets, so raising the
water target from 2,000 to 3,000 ml retroactively un-finishes every day you
drank 2 litres. Put the target back, or tick the affected days off by hand.

### "The app won't install"

- **iPhone:** it has to be **Safari**. Chrome and Firefox on iOS cannot add apps
  to the home screen. Use Share → Add to Home Screen; there is no install
  banner, and there never will be.
- **Android:** use Chrome, and open the real `https://` address. If the ⋮ menu
  has no **Install app** item, **Add to Home screen** does the same job.
- Either way, install from the deployed site, not from a local dev server.
- If you have already installed it, the menu item disappears — look for the icon
  you already have.

### "The day didn't roll over"

The app watches for local midnight and re-checks the date whenever you come back
to it, so a phone that slept through the boundary catches up when you unlock it.
If it still shows yesterday, close the app fully and reopen it, or reload the
page.

The date comes from the phone's own clock and timezone. If either is wrong, the
day numbers will be wrong too — check the phone's date settings before assuming
the app is broken.

### The crash screen

If the app hits an error and stops drawing, you get a screen with two buttons:

- **Reload the app** — usually enough, and your data is untouched.
- **Download my data** — writes `75-hard-rescue-YYYY-MM-DD.json`, a raw copy of
  everything stored on the device. It reads the storage directly, so it works
  even when the rest of the app does not.

One caveat worth knowing: the rescue file is the raw log, **not** a backup file,
so *Restore from backup* will not accept it, and it does not contain your
photos. Keep it safe anyway — it is a complete record of your days and can be
recovered by hand. If the app is working at all, prefer a proper backup from
*Settings → Your data*.

### Nothing is saving

The orange strip at the top of the app means the browser is refusing to write to
storage — private browsing, a full disk, or a locked-down setting. Anything you
log while it is showing will disappear when the app closes. Get out of private
mode, or free up space, before you carry on.
