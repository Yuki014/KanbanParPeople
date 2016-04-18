(function (_, util) {
    'use strict';

    var model = util.namespace('kpp.model'),
        defaultOptions = { },
        columnKeys = [
            '_id',
            'assignee',
            'body',
            'title',
            'isWorking',
            'workHistory',
            'updated_at',
            'created_at',
            'github',
            'stage',
            'cost',
            'labels' // ids
        ];

    model.Issue = model.Issue || Issue;

    function Issue(o) {
        this.opts = _.defaults(o || {}, defaultOptions);
        this.init(this.opts);
    }

    Issue.defaultCost = 3;
    Issue.calcAllWorkingIntervalTime = 1000 * 20; // 20 seconds

    Issue.prototype.init = function (o) {
        _.each(columnKeys, function (key) { this[key] = ko.observable(o[key]); }.bind(this));
        this.labels = ko.observableArray((o && o.labels) || []);
        this.workHistory = ko.observableArray((o && o.workHistory) || []);

        // プロジェクトに所属しているMembers (オブジェクトを指定して監視する)
        this.members = o.members || ko.observableArray();

        // アサインメンバー
        this.assigneeMember = ko.computed(function () {
            var userId = this.assignee();
            return _.find(this.members(), function (x) { return x._id() === userId; });
        }, this, {deferEvaluation: true});

        // 表示タイトル
        this.displayTitle = ko.computed(function () {
            var title = this.title();
            if (this.github() && this.github().number && this.github().number !== '0') {
                title = '#' + this.github().number + ' ' + title;
            }
            return title;
        }, this);

        // ひとつの作業履歴の作業時間
        this.calcOneWorkTime = function (history) {
            var start = new Date(history.startTime);
            var end = (history.isEnded || history.endTime) ? new Date(history.endTime) : new Date();
            return end - start;
        };

        // 合計作業時間の計算（ms）
        this.calcAllWorkTime = function () {
            return this.workHistory().reduce(function (sum, x) {
                return sum + this.calcOneWorkTime(x);
            }.bind(this), 0);
        };

        // 合計作業時間 (ms)
        this.allWorkTime = ko.observable(this.calcAllWorkTime());

        // 合計作業時間 (h時間m分)
        this.allWorkTimeFormat = ko.computed(function () {
            return util.dateFormatHM(this.allWorkTime());
        }, this);

        // 最後の作業時間
        this.lastWorkTime = ko.observable(0);

        // 最後の作業時間を計算
        this.calcLastWorkTime = function () {
            var history = this.workHistory();
            if (!history.length) { return 0; }
            return this.calcOneWorkTime(history[history.length - 1]);
        };

        // 作業時間を一定期間おきに計算
        // ただし、いくつものIssueが同時に計算しないように最初にランダムにwaitを入れる
        var timeoutId = null;
        var calcAllWorkTimeIntervalFunc = function () {
            this.allWorkTime(this.calcAllWorkTime());
            this.lastWorkTime(this.calcLastWorkTime());

            if (this.isWorking()) {
                timeoutId = setTimeout(calcAllWorkTimeIntervalFunc, Issue.calcAllWorkingIntervalTime);
            } else {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            }
        }.bind(this);

        this.isWorking.subscribe(calcAllWorkTimeIntervalFunc);
        if (this.isWorking()) {
            setTimeout(calcAllWorkTimeIntervalFunc, 1000);
        }

        this.workHistory.subscribe(function () {
            this.allWorkTime(this.calcAllWorkTime());
        }, this);

        // workHistoryのプロパティの追加
        this.addWorkHistoryProperty = _.debounce(function () {
            this.workHistory().forEach(function (x) {
                x.startTimeFormat = moment(new Date(x.startTime)).format('YYYY/MM/DD HH:mm:ss');
                x.endTimeFormat = x.endTime ? moment(new Date(x.endTime)).format('YYYY/MM/DD HH:mm:ss') : '-';
                x.duration = (x.isEnded && x.endTime) ? util.dateFormatHM((new Date(x.endTime)) - (new Date(x.startTime))) : '-';
                x.user = _.find(this.members(), function (user) { return user._id() === x.userId; });
                x.userName = x.user ? x.user.userName() : null;
            }.bind(this));
        }.bind(this), 200);
        this.addWorkHistoryProperty();
        this.workHistory.subscribe(this.addWorkHistoryProperty, this);
        this.members.subscribe(function () {
            this.addWorkHistoryProperty();
        }, this);
    };

}(_, window.nakazawa.util));