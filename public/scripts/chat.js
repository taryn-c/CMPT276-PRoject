
$(document).ready(function() {
    var socket = io();
    var last_author = null;
    var user_list = {};

    $('form').submit(function(e) {
        e.preventDefault(); // prevents page reloading

        var message = $('#chat-box').val();
        if (message.trim() != '') {
          socket.emit('chat message', $('#chat-box').val());
          $('#chat-box').val('');
        }
        return false;
    });

    socket.on('chat message', function(msg) {
        var isContinuation = last_author === msg.authorId && msg.authorId != null;
        onMessageReceived(msg.author, new Date(msg.date), msg.text, isContinuation);
        last_author = msg.authorId;
    });

    socket.on('user joined', function(user) {
        user_list[user.authorId] = user;
        last_author = '$SYSTEM$';
        onStatusReceived(user.author, new Date(user.date), `${user.author} joined the chat.`);
        onUserListUpdate(user_list);
    });

    socket.on('user left', function(user) {
        delete user_list[user.authorId];
        last_author = '$SYSTEM$';
        onStatusReceived(user.author, new Date(user.date), `${user.author} left the chat.`);
        onUserListUpdate(user_list);
    });

    socket.on('user list', function(users) {
        user_list = users;
        onUserListUpdate(user_list);
    });
});

function onUserListUpdate(user_list) {
  var element = $("#users");
  var users = Object.values(user_list)
    .map(v => v.author)
    .sort();

  element.empty();
  for (var user of users) {
    var item = $("<li>");
    item.text(user);
    element.append(item);
  }
}

function onStatusReceived(author, date, message) {
  var template = document.querySelector("#status-template");
  var element = document.importNode(template.content, true).querySelector(".chat-status");

  // Update the data in the cloned element
  element.querySelector(".chat-status-author").textContent = author;
  element.querySelector(".chat-status-time").textContent = date;
  element.querySelector(".chat-status-text").textContent = message;

  // Add it to the messages list.
  document.querySelector("#messages").appendChild(element);
}

function onMessageReceived(author, date, message, continuation) {
  var template = document.querySelector("#message-template");
  var element = document.importNode(template.content, true).querySelector(".chat-message");

  // If it's a continuation, we add a class to it
  if (continuation) {
    element.classList.add('continuation');
  }

  // Update the data in the cloned element
  element.querySelector(".chat-message-author").textContent = author;
  element.querySelector(".chat-message-time").textContent = date;
  element.querySelector(".chat-message-text").textContent = message;

  // Add it to the messages list.
  document.querySelector("#messages").appendChild(element);
}
