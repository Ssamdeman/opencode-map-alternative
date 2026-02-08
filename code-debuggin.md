This our debuggin rules for the project. We use anytime we need to debug the code as well as when we need to understand the code. and also when we need to fix the code and make it work as expected. and for any kind system status and all. 



HERE is how we use existin notification system for the local debuggin. The OpenCode platform's notification system is handled by the NotificationProvider and integrates with the platform context for displaying system notifications.

When you copy something (like an asset in the UI) and a notification appears in the top right corner, this functionality is managed by the NotificationProvider in packages/app/src/context/notification.tsx. This provider is initialized in AppInterface within packages/app/src/app.tsx.

The core mechanism for displaying these notifications, especially "system notifications" (like the ones that might appear in the top-right corner of your desktop environment), is through the platform.notify function. As seen in packages/app/src/entry.tsx, for the web platform, platform.notify uses the browser's native Notification API. It checks for permission, and if granted, creates a new Notification with a title, body, and icon. If a href is provided, clicking the notification will focus the window and navigate to that URL.

Additionally, user settings for notifications are managed in packages/app/src/context/settings.tsx. The SettingsGeneral component in packages/app/src/components/settings-general.tsx provides UI toggles for various notification types, such as:

settings.notifications.agent(): For when an agent finishes or needs attention.
settings.notifications.permissions(): For when a permission is required.
settings.notifications.errors(): For when an error occurs.
