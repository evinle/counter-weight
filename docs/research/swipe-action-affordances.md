# Swipe action affordances: primary-source findings

Scope: mobile swipe conventions for a timer/reminder card in a web PWA. Researched 2026-09-30.

Evidence grades used below:
- **[read]** I read the primary page text directly (Apple HIG and Apple developer docs via Apple's documentation JSON, Apple Support HTML, Android Developers Compose page, Gmail/Todoist/Things/Microsoft help pages via fetch).
- **[excerpt]** The claim comes from a search-result excerpt of a primary page. The page body is JavaScript-rendered and I could not read it directly. Treat as likely but re-check before quoting.

## Summary

- **Hints are not shown at rest; the swipe is revealed only during the drag.** No guideline or named app I checked puts a persistent hint on the row. Apple's HIG does require that a gesture "not [be] the only way to perform an important action". Takeaway: keep a tap path to complete and delete, such as a button, a long-press menu or a detail view, and treat the swipe as a shortcut.
- **Destructive = red; the destructive role drives the colour.** SwiftUI's `.destructive` role renders a red background. Android's official sample uses saturated `Color.Red` and `Color.Blue` with white icons. The Android sample also interpolates the colour with drag progress (`lerp(Color.LightGray, Color.Blue, progress)`). Takeaway: use a neutral or muted background at low progress, saturate it as the commit threshold nears, and use white icon and label.
- **Icon placement: the official Android sample anchors the icon at the edge being revealed, vertically centred, with 12dp padding.** SwiftUI swipe actions use the filled symbol variant. Takeaway: centre the icon vertically in the card height and pin it a fixed distance from the swiped edge. Put the label under the icon only if there is room.
- **Confirmation: the platforms split.** Apple Mail treats "Swipe left quickly" as a delete. Apple Reminders, Clock and Microsoft To Do need a second tap or a confirm for delete. `allowsFullSwipe` defaults to true in SwiftUI. Takeaway: for a timer, make complete a one-shot full swipe and make delete reveal-then-tap. Add undo or recovery if delete is committed on swipe.
- **Card layout: no primary source I could read prescribes fixed-height cards or how to handle absent optional content.** Only the Compose `Card` page gave a usable fact: it lays content out in a `Column` and sizes via `Modifier`. Treat the fixed-title-row-plus-body advice as engineering inference (see Q5).

## 1. Hints at rest vs revealed during drag; discoverability

- Apple's Gestures HIG says a custom gesture should be "Discoverable" and "Not the only way to perform an important action in your app or game". It adds that people "need simple, familiar ways to navigate and perform actions, even if it means an extra tap or two". [read] [Apple HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)
- The same page says to "Offer moments in your app to help people quickly learn and perform custom gestures". It also says to avoid using "a familiar gesture like tap or swipe to perform an action that's unique to your app". Its worked example is a Back button with a swipe as shortcut. [read] [Apple HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)
- Apple's Lists and Tables HIG has no at-rest swipe-hint guidance. Its only related statements are that in iOS "people must enter an edit mode before they can select table items" and that people like reordering. [read] [Apple HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- The UIKit description is that "Users swipe horizontally left or right in a table view to reveal the actions associated with a row". The actions appear only on swipe; the docs describe no at-rest indicator. [read] [Apple Developer: UISwipeActionsConfiguration](https://developer.apple.com/documentation/uikit/uiswipeactionsconfiguration)
- Material 3: a search excerpt of the Lists guidance says swipeable list items should offer an alternative route to hidden actions, "such as a more icon". [excerpt] [Material 3: Lists guidelines](https://m3.material.io/components/lists/guidelines)
- Gmail, Todoist and Things document swipe gestures only in settings or support articles, which are not at-rest hints.
  - Gmail: swipe is a setting under Settings > General settings > Swipe actions. [read] [Gmail Help: Archive messages](https://support.google.com/mail/answer/6576?hl=en&co=GENIE.Platform%3DAndroid)
  - Todoist: swipe is configurable, with a None option. [read] [Todoist Help: How to change your swipe actions](https://www.todoist.com/help/articles/how-to-change-your-swipe-actions-D5DQOQz6)
  - Things: "Using Gestures" is a support article. [read] [Things Support: Using Gestures](https://culturedcode.com/things/support/articles/2803582/)
  - Apple Reminders: the "Indent" swipe is documented as a swipe, and the same page gives a Flag button as the non-swipe route. [read] [Apple Support: Use Reminders](https://support.apple.com/en-us/102484)

## 2. Icon, label and colour for complete vs destructive

- SwiftUI `swipeActions`: when a button has a role, "SwiftUI styles the button according to its role". The Delete action in the docs example appears in red because of the `.destructive` role. Use the `tint` modifier to set a different colour. [read] [Apple Developer: swipeActions(edge:allowsFullSwipe:content:)](https://developer.apple.com/documentation/swiftui/view/swipeactions(edge:allowsfullswipe:content:))
- The same page says "For labels or images that appear in swipe actions, SwiftUI automatically applies the fill symbol variant". [read] [Apple Developer: swipeActions](https://developer.apple.com/documentation/swiftui/view/swipeactions(edge:allowsfullswipe:content:))
- `ButtonRole.destructive`: "Use this role for a button that deletes user data, or performs an irreversible operation". It is presented "using a red background". [read] [Apple Developer: ButtonRole.destructive](https://developer.apple.com/documentation/swiftui/buttonrole/destructive)
- Apple's Buttons HIG: "a destructive button uses the system red color". [read] [Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- For UIKit, `UIContextualAction.backgroundColor` defaults from the action's `style`, and you can assign a custom colour. [read] [Apple Developer: UIContextualAction.backgroundColor](https://developer.apple.com/documentation/uikit/uicontextualaction/backgroundcolor)
- Android Compose official sample:
  - Complete uses `Icons.Default.CheckBox` on `Color.Blue`. Delete uses `Icons.Default.Delete` on `Color.Red`. Both use `tint = Color.White`.
  - A second example animates the background with `lerp(Color.LightGray, Color.Blue, swipeToDismissBoxState.progress)`. This is the only primary-source statement I found about muted-to-saturated colour.
  - [read] [Android Developers: Swipe to dismiss or update](https://developer.android.com/develop/ui/compose/touch-input/user-interactions/swipe-to-dismiss)
- Material 3 list guidance, as an excerpt: swipe reveals buttons, with "a mix of button styles" and the primary action as the final end-aligned option. [excerpt] [Material 3: Lists guidelines](https://m3.material.io/components/lists/guidelines)
- Apple Color HIG is general: it warns that insufficient contrast blends icons and text into the background. It also notes "red communicates danger in some cultures, but has positive connotations in other[s]". It does not say muted vs saturated for swipe actions. [read] [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- Apple Mail and Reminders use system colours, which I did not verify from a primary page. Their icon-only vs icon-plus-label rendering is not specified in any page I read (see Unverified).

## 3. Icon and label placement inside the revealed area

- Android official sample: the icon is a child of `backgroundContent`. It is sized `fillMaxSize()` and placed with `.wrapContentSize(Alignment.CenterStart)` for start-to-end swipes and `Alignment.CenterEnd` for end-to-start swipes. It then gets `.padding(12.dp)`. The icon sits at the edge being revealed and is vertically centred in the row. The sample uses an icon only, with no label. [read] [Android Developers: Swipe to dismiss or update](https://developer.android.com/develop/ui/compose/touch-input/user-interactions/swipe-to-dismiss)
- In that sample the background is a full-size layer behind the content, not something that moves with the card. The icon stays anchored to the edge while the foreground slides. This is a property of the sample code, not a stated guideline.
- SwiftUI: "Actions appear in the order you list them, starting from the swipe's originating edge". The Delete action sits closest to the trailing edge. [read] [Apple Developer: swipeActions](https://developer.apple.com/documentation/swiftui/view/swipeactions(edge:allowsfullswipe:content:))
- UIKit swipe buttons are created from `UIContextualAction` with title and image. The documentation shows no measurements for spacing, label placement, or tracking the card edge. [read] [Apple Developer: UIContextualAction](https://developer.apple.com/documentation/uikit/uicontextualaction)
- Icon-over-label vs icon-only: Apple's `Button` docs say labels of buttons can show "text, an icon, or both". They also say to "Avoid labels that only use images... without an accessibility label". [read] [Apple Developer: Button](https://developer.apple.com/documentation/swiftui/button)

## 4. Confirmation patterns for destructive swipes

What the guidelines say:
- SwiftUI and UIKit allow full swipe to perform the first action. SwiftUI says it is on by default ("The default is true") and can be set to `false` per edge. UIKit's `performsFirstActionWithFullSwipe` also defaults to on. [read] [Apple Developer: swipeActions](https://developer.apple.com/documentation/swiftui/view/swipeactions(edge:allowsfullswipe:content:)) and [Apple Developer: performsFirstActionWithFullSwipe](https://developer.apple.com/documentation/uikit/uiswipeactionsconfiguration/performsfirstactionwithfullswipe)
- Apple's Action Sheets HIG is about dialogs, not swipes. It uses the destructive style for destructive buttons and places them "at the top of the action sheet". It says an alert is "usually unexpected". [read] [Apple HIG: Action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets)
- Android Compose: `confirmValueChange` decides whether the swipe settles. The sample returns `it != StartToEnd`, so complete resets the row and delete dismisses it. Android's docs show no undo snackbar in the sample. [read] [Android Developers: Swipe to dismiss or update](https://developer.android.com/develop/ui/compose/touch-input/user-interactions/swipe-to-dismiss)
- Material 3 Lists, as an excerpt: "A full swipe triggers [the primary] action, clearing the list item and all other actions off-screen". [excerpt] [Material 3: Lists guidelines](https://m3.material.io/components/lists/guidelines)
- Material's Snackbar guidance on undo: I could not read it (see Unverified).

What the named apps do:
- **Apple Reminders:** "To delete a reminder without marking it as completed, swipe left on it, then tap Delete". This is reveal-then-tap. [read] [Apple Support: Use Reminders](https://support.apple.com/en-us/102484)
- **Apple Clock:** alarms: "Swipe left over the alarm and tap Delete". Timers follow the same pattern per a search excerpt. [read] [Apple Support: Set and change alarms](https://support.apple.com/en-us/118444); timers [excerpt] [Apple Support: Set timers in Clock](https://support.apple.com/guide/iphone/set-timers-iph8241d6b2a/ios)
- **Apple Mail:** "Swipe left quickly over a single email" is one of the ways to delete. This is a fast full swipe that commits. The same page lists touch-and-hold and buttons as non-swipe alternatives. [read] [Apple Support: Delete emails](https://support.apple.com/en-us/102428)
- **Microsoft To Do:** "you can swipe from right to left to delete". "our mobile apps automatically ask for confirmation before deleting". [read] [Microsoft Support: Create, edit, delete, and restore tasks](https://support.microsoft.com/en-us/todo/create-edit-delete-and-restore-tasks)
- **Todoist:** the swipe action is user-configurable (Complete, Schedule, Delete, Reminders, Select on Android). The help page says nothing about confirmation or undo. [read] [Todoist Help](https://www.todoist.com/help/articles/how-to-change-your-swipe-actions-D5DQOQz6)
- **Things 3:** swipe right opens "When" (schedule). Swipe left selects a to-do. Swipe-left delete applies to checklist items. Completion is by tapping the circle. [read] [Things Support: Using Gestures](https://culturedcode.com/things/support/articles/2803582/)
- **Gmail:** swipe is configurable and the help page says nothing about undo. [read] [Gmail Help](https://support.google.com/mail/answer/6576?hl=en&co=GENIE.Platform%3DAndroid)
- **Google Keep:** I found no help page covering swipe or undo for Keep.

## 5. Card content layout, optional content, stable height

Little primary evidence. What I could read:
- Android Compose `Card` "wraps its content in a `Column`", placing each item below the previous one. Height is set by the caller via `Modifier`, for example `.size(width = 240.dp, height = 100.dp)`. Cards present "a single coherent piece of content". Cards have no built-in swipe and integrate with `SwipeToDismissBox`. [read] [Android Developers: Card](https://developer.android.com/develop/ui/compose/components/card)
- Apple's Lists and Tables HIG says "Short, succinct text can help minimize truncation and wrapping". It also says "If each item consists of a large amount of text, consider alternatives that help you avoid displaying over-large table rows". It says row-based format is good for scanning and that varied-size items suit a collection instead. [read] [Apple HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- The same page mentions row styles that put "a small image in the leading end of a row, followed by a brief explanatory label". [read] [Apple HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- Nothing I read says how to treat absent optional content such as tags (reserve space vs collapse). **Engineering inference, not sourced:** a stable title row with the body under it, and either a reserved tag-row height or a consistent card `min-height`, avoids content floating and height jumps. Verify this against Material 3's card anatomy page in a browser.

## Unverified / could not confirm

- **Material 3 pages** (Lists, Cards, Gestures, Snackbar on m3.material.io) are JavaScript-rendered. Plain HTTP fetch returned no body text. Every M3 claim above is a search-result excerpt. I could not verify the snackbar/undo guidance, "consistent height" for cards, or the card anatomy and optional-content guidance.
- **Material 3 `ListItem` API** (one/two/three-line layouts, optional supporting content): the reference page did not render. Not confirmed.
- **Muted vs saturated background:** only the Android `lerp(LightGray, Blue, progress)` example supports muted-to-saturated. No Apple or Material text states a preference.
- **Icon/label placement in UIKit and SwiftUI swipe buttons** (spacing from the edge, vertical centring, label under icon): not specified in the docs I read. Apple's built-in rendering (icon over label in Mail and Reminders) is familiar but I could not trace it to a primary page.
- **Tracking the card edge during the drag:** not documented in any primary source I read. It is inferable only from the Android sample structure.
- **Gmail swipe undo snackbar and Google Keep swipe behaviour:** no Google help page I fetched mentions them. Any claim that they exist is unverified.
- **Todoist delete confirmation/undo, Things 3 delete confirmation, Microsoft To Do swipe-right-to-complete:** not stated in the help pages read.
- **Apple Clock timer swipe** comes from a search excerpt; the guide page's body was not readable via fetch.
- **Whether Apple Mail's full-swipe delete shows confirmation or undo:** not stated.
