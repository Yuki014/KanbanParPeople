(function (global, $, _, ko, util) {
    'use strict';

    var viewmodel = util.namespace('kpp.viewmodel'),
        model = util.namespace('kpp.model'),
        view = util.namespace('kpp.view'),
        alert = new (util.namespace('util.viewmodel')).Alert(),
        effects = view.effects,
        scroller = new view.Scroller({
            selectors: ['body', '.main', '.stage-block'],
            cancelSelectors: ['.card']
        }),
        socket = new model.Socket(),
        project = new model.Project(),
        kanban = new viewmodel.Kanban({socket: socket}),
        MiniMenu = view.MiniMenu,
        alertHub = new viewmodel.AlertHub(alert, {kanban: kanban, socket: socket}),
        vm = {},
        projectId;

    vm = kanban;
    vm.alerts = alert.alerts;

    // knockout sortable option
    ko.bindingHandlers.sortable.options.scroll = false;
    ko.bindingHandlers.sortable.beforeMove = kanban.onBeforeMoveDrag;

    // test
    window.vm = vm;

    projectId = getProjectId();
    project.fetch(projectId)
        .then(function () {
            return kanban.init(project);
        })
        .done(function () {
            effects.applyBindings(global);
            MiniMenu.applyBindings(global);
            MiniMenu.init(null);
            ko.applyBindings(vm);
            $('.switch').bootstrapSwitch()
                .on('switchChange.bootstrapSwitch', function (e, state) {
                    // checkboxとgithub.syncを同期
                    project.github().sync(state);
                });
            initIssueMarkDown();
        });

    function getProjectId() {
        return _.compact(location.pathname.split('/')).splice(-2, 1)[0];
    }

    function initIssueMarkDown() {
        var markDownEle;
        var $content = $('#issue-detail-body');
        var body = vm.updateIssueDetailBody;

        $.fn.markdown.messages['en'] = {
            'Preview': 'Preview/Edit'
        };

        $content.markdown({
            resize: 'both',
            onShow: function (e) {
                markDownEle = e;
            }
        });

        body.subscribe(function () {
            markDownEle.hidePreview();
            setTimeout(function () {
                markDownEle.showPreview();
            }, 300);
        });
    }

}(window, jQuery, _, ko, window.nakazawa.util));
