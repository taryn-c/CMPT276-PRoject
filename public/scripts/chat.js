
$(document).ready(function() {
    var socket = io();
    var last_author = null;

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
      console.log(msg);
        onMessageReceived(msg.author, new Date(msg.date), msg.text, last_author === msg.authorId && msg.authorId != null);
        last_author = msg.authorId;
    });
});

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
