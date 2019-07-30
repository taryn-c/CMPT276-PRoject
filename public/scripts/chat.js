
$(document).ready(function() {
    var socket = io();
    var last_author = null;
    var user_list = {};

    $('form').submit(function(e) {
        e.preventDefault(); // prevents page reloading

        var message = $('#chat-box').val();
        if (message.trim() != '') {
         var targetList = $("#chat-target");
          switch (targetList.val()) {
            case '#global':
              socket.emit('chat message', $('#chat-box').val());
              break;

            default:
              socket.emit('direct message', {
                message: $('#chat-box').val(),
                target: targetList.val()
              });
          }
          $('#chat-box').val('');
        }
        return false;
    });

    socket.on('chat message', function(msg) {
        var isContinuation = last_author === msg.authorId && msg.authorId != null;
        onMessageReceived(msg.author, new Date(msg.date), msg.text, isContinuation);
        last_author = msg.authorId;
        notify();
    });

    socket.on('direct message', function(msg) {
        var isContinuation = last_author === (msg.authorId + "#DM") && msg.authorId != null;
        onMessageReceived(msg.author, new Date(msg.date), msg.text, isContinuation, true);
        last_author = msg.authorId + "#DM";
        notify();
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
    .sort((a, b) => a.author.localeCompare(b.author));

  element.empty();
  for (let user of users) {
    let item = $("<li>");
    let link = $("<a>");
    link.attr('title', 'Send a direct message.');
    link.on('click', () => {
      selectTarget(user);
    })

    link.text(user.author);
    item.append(link);
    element.append(item);
  }

  function selectTarget(user) {
    var targetList = $("#chat-target");
    var targetDms = $("#chat-target-dms");

    if (user == null) {
      targetList.val('#global');
      return;
    }

    if (targetDms.find(`[value="${user.authorId}"]`).length === 0) {
      var targetDmOption = $("<option>");
      targetDmOption.attr('value', user.authorId);
      targetDmOption.text('@' + user.author);
      targetDms.append(targetDmOption);
    }

    targetList.val(user.authorId);

    $("#chat-box").select();
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

function onMessageReceived(author, date, message, continuation, private) {
  var template = document.querySelector("#message-template");
  var element = document.importNode(template.content, true).querySelector(".chat-message");

  // If it's a continuation, we add a class to it
  if (continuation) {
    element.classList.add('continuation');
  }

  if (private) {
    element.classList.add('private');
  }

  // Update the data in the cloned element
  element.querySelector(".chat-message-author").textContent = author + (private ? ' (DIRECT MESSAGE)' : '');
  element.querySelector(".chat-message-time").textContent = date;
  element.querySelector(".chat-message-text").textContent = message;

  // Add it to the messages list.
  document.querySelector("#messages").appendChild(element);
}

function notify() {

        let oldTitle = document.title;
        document.title = "[NEW MESSAGE]";
        setTimeout(() => document.title = oldTitle, 2500)
}
