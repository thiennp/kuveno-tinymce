function main() {
  var users = [
    { name: 'John', id: '01234' },
    { name: 'Tim',  id: '01235' },
    { name: 'Eliza', id: '01236' }
  ];

  tinymce.init({
    skin: 'kuveno',
    selector: 'div[name=meeting-doc]',
    menubar: false,
    style_formats: [
        {title: 'Heading', block: 'h1'},
        {title: 'Item heading', block: 'h2'},
        {title: 'Sub heading', block: 'h3'}
    ],
    toolbar: 'undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent link | task | decision',
    statusbar : false,
    plugins: 'noneditable link mention paste autolink',
    content_css: 'css/styles.css',
    mentions: {
      source: users,
      insert: function(item) {
        return createUserElement(item).get(0).outerHTML
      }
    },
    setup: function(editor) {
      editor.addButton('task', {
        text: 'Task',
        icon: 'clipboard',
        tooltip: 'New task',
        onclick: createOnClickCallback('task')
      });

      editor.addButton('decision', {
        text: 'Decision',
        tooltip: 'New decision',
        icon: 'hammer',
        onclick: createOnClickCallback('decision')
      });

      editor.on('keydown', keydownEventHandler);

      editor.on('init', function(evt){
        editor.getBody().setAttribute('spellcheck', true);
      });

      // @todo load locales from user settings
      moment.locale('fi');

      function createOnClickCallback(className) {
        return function() {
          var element = getCurrentSelectionNode();

          if (!isParagraph(element)) {
            if (!isChildOfParagraph(element)) {
              return;
            }

            element = element.parentNode
          }
          if(isTask(className)) {
            cleanUpAndSetTask(element);
          } else {
            cleanUpAndSetDecision(element);
          }
        }
      }

      function getCurrentSelectionNode() {
        return editor.selection.getNode();
      }

      function isParagraph(element) {
        return element.nodeName === 'P';
      }

      function isChildOfParagraph(element) {
        return isParagraph(element.parentNode)
      }

      function cleanUpAndSetDecision(element) {
        var $element = $(element);

        if ($element.hasClass('decision')) {
          $element.removeClass();
        } else {
          $element.removeClass();
          $element.addClass('decision');
        }
      }

      function cleanUpAndSetTask(element) {
        var $element = $(element);
        var $assignee = $element.find('.assignee');
        var $user = $element.find('.user');
        var $deadline = $element.find('.deadline');

        if ($element.hasClass('task')) {
          $element.removeClass();
          if (!_.isEmpty($assignee.html())) {
            if ($assignee.hasClass('user')) {
              $assignee.removeClass('assignee');
            } else {
              $assignee.remove();
            }
          }
          $deadline.remove();
        } else {

          var descriptionArea = new tinymce.ui.Label({
            label: 'Description',
            multiline: true
          });

          // Make the description text fit inside the dialog window.
          var insideText = $element.text().substr(0,55);
          var indexOfLastSpace = insideText.lastIndexOf(' ');
          insideText = insideText.substring(0,indexOfLastSpace);
          insideText += ' ...';
          descriptionArea.text(insideText);

          var assigneeListBox = new tinymce.ui.ListBox({
            name: 'assignee', label: 'Owner', values: _.map(users, userToListboxElement)
          });

          if(_.isEmpty($assignee.html())) {
            assigneeListBox.value($element.find('.user').data('id'));
          } else {
            assigneeListBox.value($element.find('.assignee').data('id'));
          }


          var aDate = moment().add(7,'days');

          var datetimePicker = new tinymce.ui.TextBox({
            name: 'deadline', label: 'Due date', value: aDate.format('L')
          });

          editor.windowManager.open({
            title: 'Task properties',
            body: [
              descriptionArea,
              assigneeListBox,
              datetimePicker
            ],
            width: 500,
            height: 200,
            onsubmit: function(e) {

              // _.find uses strict comparison, hence the string casting
              var assignee = _.find(users, { id: '' + e.data.assignee });

              if (_.isEmpty($assignee.html())) {
                // The task did not have anyone assigned to it prior to the window opening

                if(_.isEmpty($user.html())) {
                  // No users mentioned, create the assignee
                  $element.prepend(createAssigneeElement(assignee));
                } else {
                  // There was at least one user marked, loop through them and compare to the dialog assignee
                  var found = false;
                  $.each($user, function(index, value) {
                    if($(value).data('id')===assignee.id) {
                      found = true;
                      // mark this guy as assignee and move on.
                      $(value).addClass('assignee');
                    }
                  });
                  if(!found) {
                    $element.prepend(createAssigneeElement(assignee));
                  }
                }
              } else {
                // There was somebody assigned. If that person was also marked as user,
                // just remove the class - ie. the dialog did not add the user automatically
                if($assignee.hasClass('user')) {
                  $assignee.removeClass('assignee');
                  // Create a new assignee element
                  $element.prepend(createAssigneeElement(assignee));
                } else {
                  // Just switch the name & id of the assignee
                  $assignee.text(assignee.name);
                  $assignee.data('id', assignee.id);
                }
              }

              $element.append(createDeadlineElement(e.data.deadline));

              $element.removeClass();
              $element.addClass('task');
            }
          });

          // The _id thingie here is the TinyMCE's dynamically generated form html-id
          new Pikaday({
            field: document.getElementById(datetimePicker._id),
            format: 'L'
          });
        }
      }

      function isTask(className) { return className === 'task'; }

      function userToListboxElement(user) {
        return { text: user.name, value: user.id };
      }

      function keydownEventHandler(e) {
        if (isEnterKey(e.keyCode)) {
          var currentElement = getCurrentSelectionNode();

          if (isParagraph(currentElement)) {
            var $element = $(currentElement);

            // If caret is inside an empty task/decision block, we remove the block if enter is pressed.
            if (isEmptyCustomElement($element)) {
              $element.removeAttr('class');

              // Keeps the caret on the spot
              tinymce.dom.Event.cancel(e);
            }
          }
        }
      }

      function isEmptyCustomElement($element) {
        return isCustomElement($element) && $element.text() === '';
      }

      function isCustomElement($element) {
        return ($element.hasClass('task') || $element.hasClass('decision'));
      }

      function isEnterKey(keyCode) { return keyCode == 13; }
    }
  });

  function createAssigneeElement(user) {
    return $('<span>', {
      // data-mce-contenteditable: false does not appear if element is created inside the dialog (wat)
      'data-id': user.id, class: 'assignee mceNonEditable', 'data-mce-contenteditable': false,
      'title' : 'Owner:' + user.name
    }).text(user.name);
  }

  function createUserElement(user) {
    return $('<span>', {
      'data-id': user.id, class: 'user mceNonEditable', 'data-mce-contenteditable': false,
      'title' : 'User: ' + user.name
    }).text(user.name);
  }

  function createDeadlineElement(deadline) {
    return $(' <span>', {
      'data-date': deadline, class: 'deadline mceNonEditable', 'data-mce-contenteditable': false,
      'title' : 'Due: ' + deadline
    }).text(deadline);
  }

  $('button[name=save]').on('click', function(e) {
    e.preventDefault();

    var content = tinyMCE.activeEditor.getBody();

    console.log(content);

    /* Error checking
    $(content).find('.task, .decision').each(function(index, element) {
      var $element = $(element);

      var $assignee = $element.find('.assignee');

      if ($assignee.html() === '') {
        console.log($element.html() + ' is missing the assignee');
      }

      var deadline = $element.data('deadline');

      if (_.isEmpty(deadline)) {
        console.log($element.html() + ' is missing the deadline');
      }
    })*/
  })
}
