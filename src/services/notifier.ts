export interface Notification {
  title: string;
  message: string;
}

const notifications: Notification[] = [];

export function sendNotification(notification: Notification): void {
  notifications.push(notification);
  if (notifications.length > 100) notifications.shift();
}

export function listNotifications(): Notification[] {
  return [...notifications];
}
