# Background Message Posting System

## Feature Overview

The Background Message Posting System allows users to post messages to forum threads using multiple accounts without disrupting their current browsing session. This feature streamlines the process of managing multiple forum identities by eliminating the need to log in and out repeatedly.

## Core Functionality

### Account Management
- Users can authenticate multiple forum accounts and save their session data
- Account credentials and session cookies are securely stored locally
- Users can easily switch between accounts without logging out and in

### Message Posting Interface
- A modal/popup interface accessible from thread listings
- Contains a fully-functional message composition box
- Displays a list of available accounts to post with
- Allows sending messages from any stored account regardless of currently logged-in user

### Background Processing Queue
- Messages are added to a queue when submitted
- Queue processes posts in the background without affecting the user's current browsing session
- Multiple messages can be queued for different threads and from different accounts
- Handles antiflood measures by automatically timing retries based on forum responses

## User Experience Flow

1. **Thread Selection**
   - User browses the forum threads list
   - Each thread has a "Quick Post" button to activate the feature

2. **Message Composition**
   - User clicks "Quick Post" to open the posting modal
   - The modal displays a message composition box similar to the regular forum interface
   - A dropdown menu shows all available stored accounts
   - User selects the desired account to post with

3. **Message Submission**
   - User composes their message and clicks "Send"
   - The message is added to the background queue
   - A confirmation notification appears
   - The modal can be closed, allowing the user to continue browsing

4. **Background Processing**
   - The extension processes the queued messages in the background
   - Messages are posted using the session data of the selected accounts
   - Antiflood restrictions are handled automatically
   - Notifications inform the user of successful posts or errors

## Technical Components

### Account Storage
- Securely stores session cookies and authentication tokens for multiple accounts
- Includes mechanisms for detecting expired sessions and notifying the user

### Request Management
- Handles cookie management for authenticated requests
- Maintains essential cookies:
  - `xf_user` - Primary authentication cookie
  - `xf_session` - Session identifier
  - `xf_csrf` - CSRF protection token
  - `xf_dbWriteForced` - Updated with each request

### Message Queue
- Maintains a queue of pending messages with metadata:
  - Message content
  - Target thread
  - Account to use
  - Timestamp
- Processes messages sequentially with appropriate timing
- Handles antiflood by parsing error responses and scheduling retries

### Error Handling
- Detects and handles common issues:
  - Antiflood restrictions
  - Expired sessions
  - Authorization failures
  - Network errors
- Provides user feedback through notifications

## Security Considerations

- Account credentials and session data are stored securely
- CSRF tokens are properly managed
- Requests follow the same patterns as normal browser requests
- No sensitive data is transmitted to external servers

## User Interface Components

### Thread List Enhancement
- Adds "Quick Post" buttons to thread listings
- Visual indicators for threads with queued messages

### Message Composition Modal
- Rich text editor (matching forum capabilities)
- Account selection dropdown
- Send button and cancel options
- Status indicators

### Queue Management
- Queue status indicator in the extension toolbar
- Option to view, edit, or cancel queued messages
- History of recent posts from the queue 