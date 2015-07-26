(function (ko, util) {
    'use strict';

    var ns = util.namespace('kpp.viewmodel');

    ns.IssueDragAndDrop = ns.IssueDragAndDrop || IssueDragAndDrop;

    function IssueDragAndDrop(kanban) {
        var that = this;

        that.kanban = kanban;

        that.draggingIssue = ko.observable();

        that.ondragstart = function (issue) {
            that.draggingIssue(issue);
            return true;
        };

        that.ondragover = function (overIssue, event) {
            var assignee = overIssue.assignee();
            var overMember = null;
            if (assignee) {
                overMember = that.kanban.project.getMember(assignee);
            }

            if (!(overMember && overMember.isWipLimited())) {
                event.preventDefault();
            }
            return true;
        };

        // カードの上にドロップ
        that.ondrop = function (overIssue, event) {
            var issue = that.draggingIssue();

            event.preventDefault();

            var assignee = overIssue.assignee();
            var overMember = null;
            if (assignee) {
                overMember = that.kanban.project.getMember(assignee);
            }

            that.dropSuccess(overIssue.stage(), overMember, overIssue, issue);

            return true;
        };

        that.dropSuccess = function (stage, member, overIssue, issue) {
            var currentAssignId = issue.assignee();
            var nextAssignId = member ? member._id() : null;

            var currentPriority = that.kanban.issues.indexOf(issue);
            var nextPriority = overIssue ? that.kanban.issues.indexOf(overIssue) : null;

            var currentStage = issue.stage();
            var nextStage = stage;

            if (currentAssignId !== nextAssignId || currentStage !== nextStage) {
                that.kanban.updateStage(issue, nextStage, nextAssignId);
            }

            if (currentStage === nextStage &&
                currentAssignId === nextAssignId &&
                nextPriority !== null && currentPriority !== nextPriority) {
                that.kanban.updateIssuePriority(issue, nextPriority);
            }
        };
    }

}(ko, window.nakazawa.util));