# Upload Tablet Functionality

The Upload Tablet provides a user interface for uploading files to the server. It incorporates several features for both regular users and administrators to manage the upload process and server-side configurations related to uploads.

## Core Features:

1.  **File Selection and Upload:**
    *   Users can select one or more files from their local system.
    *   Selected files are uploaded to a specified path on the server.
    *   The UI displays a list of active uploads with progress bars, speed, and status (pending, uploading, completed, error).
    *   Users can remove individual uploads from the active list.

2.  **Directory Navigation:**
    *   A directory browser allows users to navigate the server's file system to select the target upload directory.
    *   The current path is displayed and updated as the user navigates.
    *   The directory tree can be refreshed.

3.  **Configuration (Loaded via `useUpload` hook):**
    *   **Max File Size:** Limits the size of individual files that can be uploaded.
    *   **Allowed Extensions:** Restricts uploads to specified file types (e.g., `.jpg`, `.pdf`). A wildcard `*` allows all file types.
    *   **Max Concurrent Uploads:** Defines how many files can be uploaded simultaneously (though the current XHR implementation processes them sequentially in a loop).
    *   **Default Path:** Specifies the initial directory loaded in the browser.
    *   **Blacklist:** A list of files/directories that are hidden or restricted from view/upload.

4.  **Error Handling and Logging:**
    *   Provides feedback to the user for various error conditions:
        *   File size exceeding limit.
        *   Disallowed file extension.
        *   Permission denied during upload.
        *   Insufficient disk space (parsed from server error).
        *   Network errors.
        *   Other server-side upload failures.
    *   Upload-related events (successes, failures, admin actions) are logged to the system log on the server via an API call.
    *   Toast notifications are used to inform the user of upload status and errors.

## Admin-Specific Features:

1.  **PIN Requirement for Uploads:**
    *   Administrators can configure a global setting that requires users to enter a PIN before initiating an upload.
    *   This setting can be toggled on/off from the Upload Tablet's UI when in admin mode.
    *   If enabled, non-admin users are prompted for a PIN. The PIN is encrypted and verified via `/api/verifyPin`. A successful verification allows the current batch of selected files to be uploaded without granting full admin privileges.

2.  **Force Allow Permissions:**
    *   Admins can "force allow" uploads to a specific directory. This action likely modifies server-side permissions for the target directory to ensure write access.
    *   This is a privileged operation, and the UI includes a confirmation prompt warning of the risks.

3.  **Set Default Directory:**
    *   Admins can set the server-wide default directory that the Upload Tablet will navigate to on initial load.

4.  **Blacklist Management:**
    *   Admins can access a modal to manage the upload blacklist (e.g., add/remove entries).
    *   Updating the blacklist triggers a refresh of the directory browser.

5.  **Upload History:**
    *   Admins can view a history of upload events.
    *   The history is displayed in a modal and can be cleared by an admin.

## Technical Details & Hooks:

*   **`useUpload` Hook:**
    *   Manages the state of active uploads.
    *   Handles the core file upload logic using `XMLHttpRequest` to provide progress updates.
    *   Enforces client-side checks for file size and allowed extensions based on its configuration.
    *   Loads initial configuration (like default path) from the server.
    *   Provides functions to `uploadFile` and `removeUpload`.

*   **`UploadTablet` Component (`index.tsx`):**
    *   Main component for the upload interface.
    *   Integrates `DirectoryBrowser`, `UploadProgress`, and various modals.
    *   Uses several custom hooks:
        *   `useAuth`: For checking admin status.
        *   `useVisibility`: For checking tab visibility.
        *   `useToast`: For displaying notifications.
        *   `useLoading`: For managing loading states during API calls.
        *   `useModal`: For displaying PIN prompt, history, and blacklist modals.
        *   `useApi`: For making backend API calls.
    *   Manages state for `currentPath`, `selectedFiles`, PIN requirement status, and directory loading status.
    *   Handles user interactions like file selection, path changes, and triggering uploads.
    *   Orchestrates the PIN verification flow when "PIN Required" is active.

*   **API Endpoints Used:**
    *   `/api/upload/default-directory` (GET): To fetch initial config like default path.
    *   `/api/upload/pin-required-status` (GET/POST): To get/set the PIN requirement status.
    *   `/api/files/upload` (POST): The main endpoint for file uploads (via XHR).
    *   `/api/verifyPin` (POST): To verify the admin PIN for non-admin uploads when PIN is required.
    *   `/api/upload/force-permissions` (POST): For the "Force Allow Upload" feature.
    *   `/api/upload/set-default-directory` (POST): To set the default upload directory.
    *   `/api/upload/history` (GET): To fetch upload history.
    *   `/api/upload/clear-history` (POST): To clear upload history.
    *   `/api/system/log` (POST): For logging various upload-related events.
    *   (Implicitly via DirectoryBrowser) `/api/files/browse` (GET): To list directory contents.
    *   (Implicitly via BlacklistManager) Endpoints for managing the blacklist.

## Workflow for PIN-Required Upload (Non-Admin User):

1.  Admin enables "PIN Required for Upload" via the toggle in the Upload Tablet UI (admin mode).
2.  User (not in admin mode) selects files and clicks "Upload".
3.  The `handleUpload` function checks `isPinRequiredForUpload`.
4.  If true, `verifyAdminPinAndProceed` is called.
5.  A modal prompts the user for the admin PIN.
6.  User enters PIN.
7.  The entered PIN is encrypted using `encryptDataAsync`.
8.  The encrypted PIN is sent to `/api/verifyPin`.
9.  If verification is successful (`response.verified === true`):
    *   The modal closes.
    *   The `uploadFiles` function (passed as a callback) is executed, proceeding with the actual file uploads.
10. If verification fails:
    *   An error toast is shown.
    *   The modal may remain open for another attempt or close depending on configuration.
    *   The upload does not proceed.

This document summarizes the primary functionalities of the Upload Tablet. 