mergeInto(LibraryManager.library, {

    ShowAdInternal: function () {
        ysdk.features.LoadingAPI?.stop();
        ysdk.adv.showFullscreenAdv({
            callbacks: {
                onClose: function(wasShown) {
                    ysdk.features.LoadingAPI?.start();
                },
                onError: function(error) {
                    ysdk.features.LoadingAPI?.start();
                }
            }
        });
        console.log('----- Adv Shown -----');
    },

    GameReady: function () {
        ysdk.features.LoadingAPI?.ready();
        console.log('----- Game Ready API Init -----');
    },

    GameReadyStart: function () {
        ysdk.features.LoadingAPI?.start();
        console.log('----- Game Ready API Start -----');
    },

    GameReadyStop: function () {
        ysdk.features.LoadingAPI?.stop();
        console.log('----- Game Ready API Stop -----');
    },

});
