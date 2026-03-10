// Service Worker for Happy Coder web notifications
// Handles showing/closing notifications and routing user interactions back to the page.

self.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || !data.type) {
        return;
    }

    if (data.type === 'SHOW_NOTIFICATION') {
        var tag = data.tag;
        var title = data.title;
        var body = data.body;
        var isNotificationOnly = data.isNotificationOnly;
        var sessionId = data.sessionId;
        var permissionId = data.permissionId;

        var actions = isNotificationOnly
            ? []
            : [
                  { action: 'allow', title: data.allowLabel || 'Allow' },
                  { action: 'deny', title: data.denyLabel || 'Deny' },
              ];

        var options = {
            tag: tag,
            body: body,
            icon: '/favicon.ico',
            renotify: false,
            actions: actions,
            data: { sessionId: sessionId, permissionId: permissionId },
        };

        event.waitUntil(self.registration.showNotification(title, options));
    } else if (data.type === 'CLOSE_NOTIFICATION') {
        var tag = data.tag;

        event.waitUntil(
            self.registration.getNotifications({ tag: tag }).then(function (notifications) {
                notifications.forEach(function (notification) {
                    notification.close();
                });
            })
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    var notification = event.notification;
    var action = event.action;
    var sessionId = notification.data && notification.data.sessionId;
    var permissionId = notification.data && notification.data.permissionId;

    notification.close();

    var postToAllClients = function (message) {
        return self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clients) {
                clients.forEach(function (client) {
                    client.postMessage(message);
                });
            });
    };

    if (action === 'allow') {
        event.waitUntil(
            postToAllClients({
                type: 'NOTIFICATION_ACTION',
                action: 'allow',
                sessionId: sessionId,
                permissionId: permissionId,
            })
        );
    } else if (action === 'deny') {
        event.waitUntil(
            postToAllClients({
                type: 'NOTIFICATION_ACTION',
                action: 'deny',
                sessionId: sessionId,
                permissionId: permissionId,
            })
        );
    } else {
        // Body click — notify page and focus/open the window
        event.waitUntil(
            postToAllClients({
                type: 'NOTIFICATION_ACTION',
                action: 'click',
                sessionId: sessionId,
                permissionId: permissionId,
            }).then(function () {
                return self.clients
                    .matchAll({ type: 'window', includeUncontrolled: true })
                    .then(function (clients) {
                        for (var i = 0; i < clients.length; i++) {
                            var client = clients[i];
                            if ('focus' in client) {
                                return client.focus();
                            }
                        }
                        if (self.clients.openWindow) {
                            return self.clients.openWindow('/');
                        }
                    });
            })
        );
    }
});
