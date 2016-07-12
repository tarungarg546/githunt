/**
 * @returns {{init: init, refresh: refresh}}
 * @constructor
 */
function HubTab() {

    var trendingRequest = false,              // To make sure that there are no parallel requests
        repoGroupSelector = '.content-batch', // Batch of repositories
        filterSelector = '.repos-filter',     // Selector that matches every repo filter on page
        mainContainer = '.main-content',      // Main container div
        dateHead = '.date-head',              // Heading item for the batch of repositories
        dateAttribute = 'date',               // Date attribute on the date head of batch
        // token = 'a1a420cbad0a4d3eccda',    // API token. Don't grin, it's a dummy
        languageFilter = '#language',         // Filter for repositories language
        dateFilter = '#date-jump',            // Date jump filter i.e. weekly, monthly or yearly
        tokenStorageKey = 'githunt_token',    // Storage key for the github token
        requestCount = 0,                     // Track the count of how many times the refresh was tried
        reposApiUrl = 'https://api.github.com/search/repositories', // URL for the repos

        // All the content from last hunt will be cached in localstorage for some time to avoid
        // requests on each tab change
        huntResultKey = 'last_hunt_result',

        // Minutes for which cache will be kept
        refreshDuration = '180',

        // The time for last hunt
        huntTImeKey = 'last_hunt_time',

        //github emojis url
        emojisUrl = 'https://api.github.com/emojis',
        cacheName = 'gitHunt-emoji';

    var filterStorage = new HubStorage();

    /**
     * Fetch Emojis from GitHub
     * @param callback function
     * @returns {callback}
     */
    function fetchGitHubEmojis(url) {
        return caches.open(cacheName)
            .then(cache => {
                //check if exist in cache
                return cache.match(url)
                    .then(response => {
                        if(response) {
                            //response found in cache
                            return response;
                        } else {
                            return fetch(url,{mode:'cors'}).then(function(response){
                                    //Check if we received a valid response
                                    if(!response || response.status !== 200) {
                                        return response;
                                    }
                                    var responseToCache = response.clone();
                                    cache.put(url, responseToCache);
                                    return response;
                                });
                        }
                    })
            });
    }
    /**
     * Generates the HTML for batch of repositories
     * @param repositories
     * @param lowerDate
     * @param upperDate
     * @returns {string}
     */
    function generateReposHtml(repositories, lowerDate, upperDate, emojis) {
        var html = '';
        /**
         * Generates github styled emojified string for plain strings
         * @param source Source string supplied
         * @param emojis emoji JSON from GitHub
         * @return {string} Returns the modified string
         */
        function generateEmojifiedHTML(source, emojis) {
            var result = source.split(' ').map(function(item) {
                if(item[0] === ':' && item.slice(-1) === ':') {
                    var str = item.slice(1,-1)
                    if(emojis[str] !== undefined) {
                        return `<img src=${emojis[str]} alt=${item} class='git_emoji'/>`;
                    }
                }
                return item;
            });
            return result.join(' ');
        }
        $(repositories).each(function (index, repository) {
            var repFullName = generateEmojifiedHTML(repository.full_name,emojis);
            var repFullDesc = repository.description;
            if(repFullDesc !== null) {
                repFullDesc = generateEmojifiedHTML(repository.description,emojis);    
            } else if(repFullDesc === '' || repFullDesc === null)
            html += '<div class="content-item">' +
                '<div class="header"><a href="' + repository.html_url + '">' + repFullName + '</a></div>' +
                '<p class="tagline">' + repFullDesc + '</p>' +
                '<div class="footer">' +
                '<span class="footer-stat">' +
                '<i class="fa fa-code-fork"></i>' +
                repository.forks_count +
                '</span>' +
                '<span class="footer-stat">' +
                '<i class="fa fa-commenting-o"></i>' +
                repository.open_issues +
                '</span>' +
                '<span class="footer-stat">' +
                '<i class="fa fa-star-o"></i>' +
                repository.stargazers_count +
                '</span>' +
                '</div>' +
                '</div>';
        });

        var humanDate = moment(lowerDate).fromNow(),
            formattedLower = moment(lowerDate).format('ll'),
            formattedUpper = moment(upperDate).format('ll');

        var finalHtml = '<div class="content-batch"><h1 class="date-head" data-date="' + lowerDate + '">' + humanDate + ' - ' + formattedLower + ' &ndash; ' + formattedUpper + '</h1>' + html + '<div class="clearfix"></div></div></div>';

        return finalHtml;
    }

    /**
     * Gets the next date range for which repositories need to be fetched
     * @returns {{}}
     */
    var getNextDateRange = function () {

        // Lower limit for when the last repos batch was fetched
        var lastFetched = $(repoGroupSelector).last().find(dateHead).data(dateAttribute),
            dateRange = {},
            dateJump = $(dateFilter).val();

        if (lastFetched) {
            dateRange.upper = lastFetched;
            dateRange.lower = moment(lastFetched).subtract(1, dateJump).format('YYYY-MM-DD');
        } else {
            dateRange.upper = moment().format('YYYY-MM-DD');
            dateRange.lower = moment().add(1, 'day').subtract(1, dateJump).format('YYYY-MM-DD');
        }

        return dateRange;
    };

    /**
     * Gets the filters to be passed to API
     * @returns {{queryParams: string, dateRange: {}}}
     */
    var getApiFilters = function () {
        var dateRange = getNextDateRange(),
            language = $(languageFilter).val(),
            langCondition = '';

        // If language filter is applied, populate the language
        // chunk to put in URL
        if (language) {
            langCondition = 'language:' + language + ' ';
        }

        // If user has set the github token in storage pass that
        // alongside the request.
        var token = $.trim(filterStorage.getStorage().getItem(tokenStorageKey)),
            apiToken = '';

        if (token) {
            apiToken = '&access_token=' + token;
        }

        return {
            queryParams: '?sort=stars&order=desc&q=' + langCondition + 'created:"' + dateRange.lower + ' .. ' + dateRange.upper + '"' + apiToken,
            dateRange: dateRange
        };
    };

    /**
     * Saves the hunt result in localstorage to avoid requests on each tab change
     */
    var saveHuntResult = function () {

        var huntResults = $('.main-content').html();
        if (!huntResults) {
            return false;
        }

        // Save the hunt results to storage.
        filterStorage.getStorage().setItem(huntResultKey, huntResults);
        filterStorage.getStorage().setItem(huntTImeKey, moment().format('YYYY-MM-DD HH:mm:ss'));
    };


    /**
     * Checks whether the refresh
     * @returns {boolean}
     */
    var shouldRefresh = function () {
        // Allow refresh if..
        // ..It is not first request
        if (requestCount !== 0) {
            return true;
        }

        // ..we do not have any hunt results
        var lastHuntResult = filterStorage.getStorage().getItem(huntResultKey),
            lastHuntTime = filterStorage.getStorage().getItem(huntTImeKey);
        if (!lastHuntResult || !lastHuntTime || $.trim(lastHuntResult) === 'undefined') {
            return true;
        }

        // ..cache is stale
        var now = moment();
        var then = moment(lastHuntTime, 'YYYY-MM-DD HH:mm:ss');
        if (now.diff(then, 'minutes') >= refreshDuration) {
            return true;
        }

        // Put the last hunt results in place
        $(mainContainer).html(lastHuntResult);

        // Reset the request count because for any additional requests,
        // we do want to get the data from server.
        requestCount++;

        return false;
    };

    /**
     * Fetches the trending repositories based upon the filters applied
     * @returns {boolean}
     */
    var fetchTrendingRepos = function () {

        // If there is some request, already in progress or there was
        // an error, do not allow further requests.
        if ((trendingRequest !== false) || ($('.error-quote').length !== 0)) {
            return false;
        }

        if(shouldRefresh() === false) {
            return false;
        }

        var filters = getApiFilters(),
            url = reposApiUrl + filters.queryParams;

        trendingRequest = $.ajax({
            url: url,
            method: 'get',
            beforeSend: function () {
                $('.loading-more').removeClass('hide');
            },
            success: function (data) {
                //get Github Emojis
                fetchGitHubEmojis(emojisUrl)
                .then(result => {
                    return result.json();
                })
                .then(result => {
                    finalHtml = generateReposHtml(data.items, filters.dateRange.lower, filters.dateRange.upper,result);
                    return finalHtml;
                })
                .then(finalHtml => {
                   $(mainContainer).append(finalHtml);
                    trendingRequest = false;
                    $('.loading-more').addClass('hide');
                    saveHuntResult();
                })
                .catch(err => {
                    console.error(err);
                    $('.main-content').replaceWith('Oops! Could you please refresh the page.');
                });
            },
            error: function(xhr, status, error) {
                var error = JSON.parse(xhr.responseText),
                    message = error.message || '';

                if (message && message.toLowerCase() == 'bad credentials') {
                    $('.main-content').replaceWith('<h3 class="quote-item error-quote">Oops! Seems to be a problem with your API token. Could you verify the API token you entered in extension options.</h3>');

                    // Reset the token
                    filterStorage.getStorage().removeItem(tokenStorageKey);
                } else if (message && (message.indexOf('rate limit') !== -1)) {
                    $('.main-content').replaceWith('<h3 class="quote-item error-quote">Oops! Seems like you did not set the API token. Wait another hour for github to refresh your rate limit or better add a token in `Githunt Options` to hunt more.</h3>');
                } else {
                    $('.main-content').replaceWith('Oops! Could you please refresh the page.');
                }
            }
        });
    };

    /**
     * Perform all the UI bindings
     */
    var bindUI = function () {

        // Bind the scroll to fetch repositories when bottom reached
        $(window).on('scroll', function () {
            if ($(window).scrollTop() + $(window).height() > $(document).height() - 100) {
                fetchTrendingRepos();
            }
        });

        // On change of repository filters
        $(document).on('change', filterSelector, function () {

            // Increase the request count so that refresh is enabled
            requestCount++;

            // Remove the existing fetches repositories
            $(repoGroupSelector).remove();
            // Persist the filters
            filterStorage.persistFilters(filterSelector);
            // Refresh the repositories
            fetchTrendingRepos();
        });
    };

    return {

        /**
         * initialize the hub page
         */
        init: function () {
            bindUI();
            this.refresh();
        },

        /**
         * Refresh the listing and filters
         */
        refresh: function () {
            filterStorage.populateFilters(filterSelector);
            fetchTrendingRepos();
        }
    };
}

$(function () {
    var hubTab = new HubTab();
    hubTab.init();
});
