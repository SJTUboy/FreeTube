/*
    This file is part of FreeTube.

    FreeTube is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    FreeTube is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with FreeTube.  If not, see <http://www.gnu.org/licenses/>.
*/



/*
 * File for all functions related to subscriptions.
 */

 let subscriptionTimer;
 let checkSubscriptions = true;

/**
 * Add a channel to the user's subscription database.
 *
 * @param {string} channelId - The channel ID to add to the subscriptions database.
 *
 * @return {Void}
 */
function addSubscription(channelId, useToast = true) {
    ft.log('Channel ID: ', channelId);
    // Request YouTube API
    youtubeAPI('channels', {
        part: 'snippet',
        id: channelId,
    }, (data) => {
        const channelInfo = data['items'][0]['snippet'];
        const channelName = channelInfo['title'];
        const thumbnail = channelInfo['thumbnails']['high']['url'];

        const channel = {
            channelId: channelId,
            channelName: channelName,
            channelThumbnail: thumbnail,
        };

        // Refresh the list of subscriptions on the side navigation bar.
        subDb.insert(channel, (err, newDoc) => {
            if (useToast) {
                showToast('Added ' + channelName + ' to subscriptions.');
                displaySubs();
            }
        });
    });
}

/**
 * Remove a channel from the subscriptions database.
 *
 * @param {string} channelId - The channel ID to be removed.
 *
 * @return {Void}
 */
function removeSubscription(channelId) {
    subDb.remove({
        channelId: channelId
    }, {}, (err, numRemoved) => {
        // Refresh the list of subscriptions on the side navigation bar.
        displaySubs();
        showToast('Removed channel from subscriptions.');
    });
}

/**
 * Load the recent uploads of the user's subscriptions.
 *
 * @return {Void}
 */
 function loadSubscriptions() {
   if (checkSubscriptions === false && subscriptionView.videoList.length > 0){
     console.log('Will not load subscriptions. Timer still on.');
     loadingView.seen = false;
     return;
   }
   else{
     showToast('Refreshing Subscription List.  Please wait...');
     checkSubscriptions = false;
   }

   let videoList = [];

   const subscriptions = returnSubscriptions();

   subscriptions.then((results) => {
       let channelId = '';
       let videoList = [];

       if (results.length > 0) {
         let counter = 0;

         for (let i = 0; i < results.length; i++) {
           channelId = results[i]['channelId'];

           youtubeAPI('search', {
               part: 'snippet',
               channelId: channelId,
               type: 'video',
               maxResults: 15,
               order: 'date',
             }, (data) => {
               console.log(data);
               videoList = videoList.concat(data.items);
               counter++;
               progressView.progressWidth = (counter / results.length) * 100;
               if (counter === results.length) {
                 videoList.sort((a, b) => {
                   const date1 = Date.parse(a.snippet.publishedAt);
                   const date2 = Date.parse(b.snippet.publishedAt);

                   return date2.valueOf() - date1.valueOf();
                 });

                 // The YouTube website limits the subscriptions to 100 before grabbing more so we only show 100
                 // to keep the app running at a good speed.
                 if (videoList.length < 50) {
                   let grabDuration = getDuration(videoList.slice(0, 49));

                   grabDuration.then((list) => {
                     subscriptionView.videoList = [];
                     list.items.forEach((video) => {
                       displayVideo(video, 'subscriptions');
                     });
                     loadingView.seen = false;
                     progressView.seen = false;
                     progressView.progressWidth = 0;
                   });
                 } else {
                   console.log(videoList);
                   let finishedList = [];
                   let firstBatchDuration = getDuration(videoList.slice(0, 49));

                   firstBatchDuration.then((list1) => {
                     finishedList = finishedList.concat(list1.items);
                     let secondBatchDuration = getDuration(videoList.slice(50, 99));

                     secondBatchDuration.then((list2) => {
                       finishedList = finishedList.concat(list2.items);
                       console.log(finishedList);
                       subscriptionView.videoList = [];
                       finishedList.forEach((video) => {
                         displayVideo(video, 'subscriptions');
                       });
                       loadingView.seen = false;
                       progressView.seen = false;
                       progressView.progressWidth = 0;
                       subscriptionTimer = window.setTimeout(() => {
                         checkSubscriptions = true;
                       }, 60000);
                     });
                   });
                 }
               }
             }
           );
       }


     } else {
       // User has no subscriptions. Display message.
       loadingView.seen = false;
       headerView.seen = false;
       noSubscriptions.seen = true;
     }
   });
 }

/**
 * Get the list of subscriptions from the user's subscription database.
 *
 * @return {promise} The list of subscriptions.
 */
function returnSubscriptions() {
    return new Promise((resolve, reject) => {
        subDb.find({}, (err, subs) => {
            resolve(subs);
        });
    });
}

/**
 * Display the list of subscriptions on the side navigation bar.
 *
 * @return {Void}
 */
function displaySubs() {
    const subList = document.getElementById('subscriptions');

    subList.innerHTML = '';

    // Sort alphabetically
    subDb.find({}).sort({
        channelName: 1
    }).exec((err, subs) => {
        subs.forEach((channel) => {
            // Grab subscriptions.html to be used as a template.
            const subsTemplate = require('./templates/subscriptions.html')
            mustache.parse(subsTemplate);
            const rendered = mustache.render(subsTemplate, {
                channelIcon: channel['channelThumbnail'],
                channelName: channel['channelName'],
                channelId: channel['channelId'],
            });
            // Render template to page.
            const subscriptionsHtml = $('#subscriptions').html();
            $('#subscriptions').html(subscriptionsHtml + rendered);
        });
    });

    // Add onclick function
    $('#subscriptions .fa-times').onClick = removeSubscription;
}

/**
 * Adds / Removes a subscription based on if the channel is in the database or not.
 * @param {string} channelId - The channel ID to check
 *
 * @return {Void}
 */
function toggleSubscription(channelId) {
    event.stopPropagation();

    const checkIfSubscribed = isSubscribed(channelId);
    const subscribeButton = document.getElementById('subscribeButton');

    checkIfSubscribed.then((results) => {

        if (results === false) {
            if (subscribeButton != null) {
                subscribeButton.innerHTML = 'UNSUBSCRIBE';
            }
            addSubscription(channelId);
        } else {
            if (subscribeButton != null) {
                subscribeButton.innerHTML = 'SUBSCRIBE';
            }
            removeSubscription(channelId);
        }
    });
}

/**
 * Check if the user is subscribed to a channel or not.
 *
 * @param {string} channelId - The channel ID to check
 *
 * @return {promise} - A boolean value if the channel is currently subscribed or not.
 */
function isSubscribed(channelId) {
    return new Promise((resolve, reject) => {
        subDb.find({
            channelId: channelId
        }, (err, docs) => {
            if (jQuery.isEmptyObject(docs)) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}
