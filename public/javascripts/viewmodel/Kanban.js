(function (ko, io, _, util) {
    'use strict';

    var viewmodel = util.namespace('kpp.viewmodel'),
        model = util.namespace('kpp.model'),
        stageTypeKeys = model.stageTypeKeys,
        stages = model.stageTypes,
        DraggableIssueList = viewmodel.DraggableIssueList;

    viewmodel.Kanban = viewmodel.Kanban || Kanban;

    function Kanban(o) {
        var that = this;

        that.members = null;

        that.issues = null;

        that.project = null;

        // that.stages[name] = 各ステージのIssues
        that.stages = null;

        // that.draggableList[stage] = DraggableIssueList
        // that.draggableList[stage][UserID] = DraggableIssueList
        that.draggableList = {};

        // 追加するユーザの名前
        that.addMemberUserName = ko.observable();

        // 追加するIssueのタイトル
        that.addIssueTitle = ko.observable();

        // 追加するIssueの説明
        that.addIssueBody = ko.observable();

        // アサイン先のユーザ名
        that.assignUserName = ko.observable();

        // 選択しているIssue
        that.selectedIssue = ko.observable();

        // Issueの更新後のタイトル
        that.updateIssueDetailTitle = ko.observable();

        // Issueの更新後のBody
        that.updateIssueDetailBody = ko.observable();

        that.selectedIssue.subscribe(function (issue) {
            that.updateIssueDetailTitle(issue ? issue.title() : null);
            that.updateIssueDetailBody(issue ? issue.body() : null);
        });

        // 選択しているメンバー
        that.selectedMember = ko.observable();

        // 編集用の仮のWIP制限
        that.settingsWipLimit = ko.observable();

        // IssueListが表示されているか
        that.openedIssueList = ko.observable(false);

        // IssueListの表示/非表示の切り替え
        that.toggleOpenedIssueList = function () {
            that.openedIssueList(!that.openedIssueList());
        };

        that.selectedMember.subscribe(function (member) {
            if (member) {
                that.settingsWipLimit(member.wipLimit());
            }
        });

        // アサイン可能なメンバー
        that.canAssignMembers = ko.computed(function () {
            return that.members().filter(function (member) {
                return !member.isWipLimited();
            });
        }, that, {deferEvaluation: true});

        that.init = function (project) {
            that.project = project;
            that.members = project.members;
            that.issues = project.issues;
            that.stages = project.stages;
            that.initDraggableIssueList();

            initSocket();
        };

        // 各ステージ、各メンバー毎にDraggableIssueListを作る
        // メンバーの追加を監視する
        that.initDraggableIssueList = function () {
            that.draggableList = {};
            var _params = {
                masterIssues: that.issues,
                onUpdateStage: that.updateStage,
                onUpdatePriority: that.updateIssuePriority
            };
            _.values(stages).forEach(function (stage) {
                var params = _.extend(_params, {stage: stage.name}),
                    list;

                if (stage.assigned) {
                    list = {};
                    that.members().forEach(function (member) {
                        list[member._id()] = new DraggableIssueList(_.extend(params, {assignee: member._id()}));
                    });
                    that.members.subscribe(function (member) {
                        if (!list[member._id()]) {
                            list[member._id()] = new DraggableIssueList(_.extend(params, {assignee: member._id()}));
                        }
                    });
                } else {
                    list = new DraggableIssueList(params);
                }

                that.draggableList[stage.name] = list;
            });
        };

        // メンバーを追加する
        that.addMember = function () {
            that.socket.emit('add-member', {userName: that.addMemberUserName()}, function (res) {
                if (res.status === 'success') {
                    // reset form
                    that.addMemberUserName(null);
                }
            });
        };

        // メンバーを削除する
        that.removeMember = function () {
            var member = that.selectedMember();
            if (!member) {
                console.error('unselected member');
                return;
            }

            that.socket.emit('remove-member', {userName: member.userName()}, function (res) {
                if (res.status === 'success') {
                    // モーダルを閉じる
                    $('.modal').modal('hide');
                }
            });
        };

        // メンバー設定を更新する
        that.updateMember = function () {
            var member = that.selectedMember();
            if (!member) { return console.error('unselected member'); }

            that.socket.emit('update-member', {userName: member.userName(), wipLimit: that.settingsWipLimit()});
        };

        that.updateMemberOrderUp = function (member) {
            var members = that.members();
            var idx = members.indexOf(member);
            if (idx === 0) { return console.log(member.userName() + ' is already top'); }
            that.updateMemberOrder(member, members[idx - 1]);
        };

        that.updateMemberOrderDown = function (member) {
            var members = that.members();
            var idx = members.indexOf(member);
            if (idx === members.length - 1) { return console.log(member.userName() + ' is already bottom'); }
            that.updateMemberOrder(member, (idx + 2) === members.length ? null : members[idx + 2]);
        };

        // タスクの優先順位を変更する
        that.updateMemberOrder = function (member, insertBeforeOfMember) {
            var insertBeforeOfUserName =  insertBeforeOfMember ? insertBeforeOfMember.userName() : null;
            that.socket.emit('update-member-order', {userName: member.userName(), insertBeforeOfUserName: insertBeforeOfUserName});
        };

        // Issueと追加する
        that.addIssue = function () {
            var title = that.addIssueTitle(),
                body = that.addIssueBody();

            that.socket.emit('add-issue', {title: title, body: body}, function (res) {
                if (res.status === 'success') {
                    // reset form
                    that.addIssueTitle(null);
                    that.addIssueBody(null);
                }
            });
        };

        // Issueを削除する (archive)
        that.removeIssue = function (issue) {
            that.socket.emit('remove-issue', {issueId: issue._id()}, _.noop);
        };

        // タスクをアサインする
        // ユーザが指定されていない場合はアンアサインする
        that.assignIssue = function () {
            var issue = that.selectedIssue(),
                user = that.project.getMemberByName(that.assignUserName());

            if (!issue) { throw new Error('issue is not selected.'); }

            that.socket.emit('update-stage', {
                issueId: issue._id(),
                userId: user ? user._id() : null,
                toStage: user ? stages.todo.name : stages.backlog.name
            }, function () {
                // reset form
                that.selectedIssue(null);
                that.assignUserName(null);
            });
        };

        // タスクのステージを一つ次へ移動する
        that.nextStage = function (issue) {
            that.stepStage(issue, 1);
        };

        // タスクのステージを一つ前へ移動する
        that.prevStage = function (issue) {
            that.stepStage(issue, -1);
        };

        // タスクのステージをstep分移動する
        that.stepStage = function (issue, step) {
            var currentStage = issue.stage(),
                toIndex = stageTypeKeys.indexOf(currentStage) + step,
                toStage;

            if (!_.inRange(toIndex, 0, stageTypeKeys.length)) {
                throw new Error('cannot change stage: ' +  toIndex);
            }

            toStage = stageTypeKeys[toIndex];

            // check assign
            // 担当者が必要なステージから必要ないステージへ移行した際には
            // 担当者を外す
            var currentStageDetail = stages[currentStage];
            var toStageDetail = stages[toStage];
            var assign = undefined;
            if (currentStageDetail.assigned && !toStageDetail.assigned) {
                assign = null; // unassign
            }

            that.updateStage(issue, toStage, assign);
        };

        // タスクのステージを変更する
        that.updateStage = function (issue, toStage, /* option */userId) {
            that.socket.emit('update-stage', {issueId: issue._id(), toStage: toStage, userId: userId !== undefined ? userId : issue.assignee()});
        };

        // タスクのタイトル/説明を更新する
        that.updateIssueDetail = function () {
            var issue = that.selectedIssue();
            if (!issue) { throw new Error('issue is not selected'); }

            that.socket.emit('update-issue-detail', {
                issueId: issue._id(),
                title: that.updateIssueDetailTitle(),
                body: that.updateIssueDetailBody()
            }, function (res) {
                if (res.status === 'success') {
                    // reset form
                    that.selectedIssue(null);
                }
            });
        };

        // タスクの優先順位を変更する
        that.updateIssuePriority = function (issue, insertBeforeOfIssue) {
            var insertBeforeOfIssueId =  insertBeforeOfIssue ? insertBeforeOfIssue._id() : null;
            that.socket.emit('update-issue-priority', {issueId: issue._id(), insertBeforeOfIssueId: insertBeforeOfIssueId});
        };

        // events
        that.onClickIssueDetail = function (issue, e) {
            that.selectedIssue(issue);
            $($(e.target.parentElement).attr('data-target')).modal('show');
            return util.cancelBubble(e);
        };

        that.onClickIssueNextStage = function (issue, e) {
            that.nextStage(issue);
            return util.cancelBubble(e);
        };

        that.onClickIssuePrevStage = function (issue, e) {
            that.prevStage(issue);
            return util.cancelBubble(e);
        };

        that.onClickIssueRemove = function (issue, e) {
            that.removeIssue(issue);
            return util.cancelBubble(e);
        };

        that.onClickIssueAssign = function (issue, e) {
            that.selectedIssue(issue);
            $($(e.target.parentElement).attr('data-target')).modal('show');
            return util.cancelBubble(e);
        };

        // ソケット通信のイベント設定、デバッグ設定を初期化する
        function initSocket () {
            that.socket = new model.Socket();

            that.socket.on('connect', function () {
                that.socket.emit('join-project-room', {projectId: that.project.id()});
            });

            that.socket.on('add-member', function (req) {
                that.project.addMember(req.member);
            });

            that.socket.on('remove-member', function (req) {
                var targetMember = that.project.getMember(req.member.user._id);
                that.project.removeMember(targetMember);
            });

            that.socket.on('update-member', function (req) {
                var targetMember = that.project.getMember(req.member.user._id);
                that.project.updateMember(targetMember, req.member);
            });

            that.socket.on('update-member-order', function (req) {
                that.project.updateMemberOrder(req.userName, req.insertBeforeOfUserName);
            });

            that.socket.on('add-issue', function (req) {
                that.project.addIssue(req.issue);
            });

            that.socket.on('remove-issue', function (req) {
                var targetIssue = that.project.getIssue(req.issue._id);
                that.project.removeIssue(targetIssue);
            });

            that.socket.on('update-stage', function (req) {
                that.project.updateStage(req.issueId, req.toStage, req.assignee);
            });

            that.socket.on('update-issue-detail', function (req) {
                var targetIssue = that.project.getIssue(req.issue._id);

                ['title', 'body'].forEach(function (key) {
                    targetIssue[key](req.issue[key]);
                });
            });

            that.socket.on('update-issue-priority', function (req) {
                that.project.updateIssuePriority(req.issue._id, req.insertBeforeOfIssueId);
            });

            that.socket.initSocketDebugMode();
        }
    }

}(ko, io, _, window.nakazawa.util));