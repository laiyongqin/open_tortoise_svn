/*
Copyright (C) 2011  Masamitsu MURASE

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
*/


if (typeof(gOpenTortoiseSvnMain) == "undefined"){

var gOpenTortoiseSvnMain = (function(){
    var Cc = Components.classes;
    var Ci = Components.interfaces;
    var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
      getBranch("extensions.open_tortoise_svn.");

    var INFO_ATTRIBUTE1 = "data-tsvn-info";  // for HTML5
    var INFO_ATTRIBUTE2 = "rel";             // for HTML4.01

    var CALLBACKS = {
      browser: function(url, args){
          runTortoiseSvnBrowser(url);
      },

      log: function(url, args){
          runTortoiseSvnLog(url, args[0], args[1]);
      },

      blame: function(url, args){
          runTortoiseSvnBlame(url);
      }
    };

    var registerCallback = function(event){
        checkVersion();

        var appcontent = document.getElementById("appcontent"); // Firefox browser
        if (appcontent){
            appcontent.addEventListener("DOMContentLoaded", load, true);
		}

        var contentAreaContextMenu = document.getElementById("contentAreaContextMenu");
        if (contentAreaContextMenu){
            contentAreaContextMenu.addEventListener("popupshowing", contextMenuPopupShowing, false);
        }
    };

    ///////////////////////////////////////////////////////////////
    var load = function(event){
        if (!event || !event.originalTarget){
            return;
        }

        var doc = event.originalTarget;
        if (!isValidPage(doc)){
            return;
        }

        var body = doc.getElementsByTagName("body")[0];
        if (!body){
            return;
        }

        body.addEventListener("click", callbackClickEvent, true);
    };

    var callbackClickEvent = function(event){
        if (!processEvent(event)){
            return;
        }

        event.preventDefault();
    };

    var isValidPage = function(doc){
        try{
            var href = doc.location.href;
            var match_data = href.match(new RegExp("^(https?|file)://"));
            return !!match_data;
        }catch(e){
            return false;
        }
    };

    var findAnchorInAncestors = function(elem){
        try{
            var fail_safe = 0;
            while(elem && fail_safe++ < 100){
                if (elem.localName.toLowerCase() == "a"){
                    return elem;
                }
                elem = elem.parentNode;
            }
        }catch(e){
        }
        return null;
    };

    var processEvent = function(event){
        var anchor = findAnchorInAncestors(event.originalTarget);
        return processAnchorTag(anchor);
    };

    var processAnchorTag = function(element){
        if (!element){
            return false;
        }

        var url = element.href;
        if (!url || !isRegisteredUrl(url)){
            return false;
        }

        var callback_type = null;
        var callback_args = [];

        // Action:
        //  priority 1
        //  "action" is defined by HTML attribute.
        var info = null;
        if (element.hasAttribute(INFO_ATTRIBUTE1)){
            info = element.getAttribute(INFO_ATTRIBUTE1);
        }else if (element.hasAttribute(INFO_ATTRIBUTE2)){
            info = element.getAttribute(INFO_ATTRIBUTE2);
        }
        if (info){
            var reg = /\btsvn\[(.*?)\](?:\[(.*?)\])?/;
            var match_data = info.match(reg);
            if (match_data){
                callback_type = match_data[1];
                if (match_data[2]){
                    callback_args = match_data[2].split(",");
                }
            }
        }
        //  priority 2
        //  "action" is defined by extension-specific setting.
        if (!callback_type){
            callback_type = callbackTypeForSpecialExtension(url);
        }
        //  priority 3
        //  "action" is defined by default setting.
        if (!callback_type){
            callback_type = defaultCallbackType();
        }

        var callback = CALLBACKS[callback_type];
        if (!callback){
            return false;
        }

        callback(url, callback_args);
        return true;
    };

    var isRegisteredUrl = function(url){
        var pref_name = "url_list_pref";
        if (!prefs.prefHasUserValue(pref_name)){
            return false;
        }
        var urls = prefs.getCharPref(pref_name).split("\n").filter(function(v, i, ary){
            return ((i % 2 == 0) && ary[i+1] != "0");
        });

        return urls.some(function(u){ return url.indexOf(u)==0; });
    };

    var defaultCallbackType = function(){
        var pref_name = "default_action_pref";
        if (!prefs.prefHasUserValue(pref_name)){
            return "browser";
        }
        return prefs.getCharPref(pref_name);
    };

    var callbackTypeForSpecialExtension = function(url){
        var pref_name = "extension_actions_pref";
        if (!prefs.prefHasUserValue(pref_name)){
            return null;
        }

        var callback_type = null;
        prefs.getCharPref(pref_name).split("\n").some(function(v, i, ary){
            if (i % 2 != 0){
                return false;
            }

            var matched = v.split(",").some(function(ext){
                var str = ext.trim().toLowerCase();
                if (str.substr(0, 1)=="*"){
                    str = str.substr(1);
                }
                return url.toLowerCase().lastIndexOf(str) == url.length - str.length;
            });
            if (!matched){
                return false;
            }

            callback_type = ary[i+1];
            return true;
        });

        return callback_type;
    };

    var runTortoiseSvnBrowser = function(repos){
        var args = ["/command:repobrowser", "/path:" + repos];
        runTortoiseSvn(args);
    };

    var runTortoiseSvnLog = function(repos, start_rev, end_rev){
        var args = ["/command:log", "/path:" + repos];
        if (start_rev || start_rev==="0"){
            args.push("/startrev:" + start_rev);
        }
        if (end_rev || end_rev==="0"){
            args.push("/endrev:" + end_rev);
        }

        runTortoiseSvn(args);
    };

    var runTortoiseSvnBlame = function(repos){
        var args = ["/command:blame", "/path:" + repos];
        runTortoiseSvn(args);
    };

    var runTortoiseSvn = function(args){
        var pref_name = "tortoise_svn_path_pref";
        if (!prefs.prefHasUserValue(pref_name)){
            return;
        }

        var path = prefs.getComplexValue(pref_name, Ci.nsILocalFile).path;
        runProgram(path, args);
    };

    var runProgram = function(program, args){
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.initWithPath(program);
        var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
        try{
            process.init(file);
            process.run(false, args, args.length);
        }catch(e){
        }
    };

    /////////////////////////////////////////////////////
    var contextMenuPopupShowing = function(e){
        var menu = document.getElementById("contentAreaContextMenu");
        if (!menu || e.originalTarget != menu){
            return;
        }

        var hidden = !isPopupMenuShown();
        [ "browser", "log", "blame", "open_in_firefox", "separator" ].forEach(function(id){
            var item = document.getElementById("open_tortoise_svn_menu_" + id);
            if (item){
                item.hidden = hidden;
            }
        });
    };

    var contextMenuOpenTortoiseSvn = function(event, action){
        var url = (gContextMenu && gContextMenu.linkURL);
        if (!url || !isRegisteredUrl(url)){
            return;
        }

        if (action == "open_in_firefox"){
            gBrowser.loadURI(url);
            return;
        }

        var callback = CALLBACKS[action];
        if (!callback){
            return;
        }

        callback(url, []);
    };

    var isPopupMenuShown = function(){
        if (!gContextMenu.onLink){
            return false;
        }

        var pref_name = "context_menu_pref";
        var menu_enabled = true;
        if (prefs.prefHasUserValue(pref_name)){
            menu_enabled = prefs.getBoolPref(pref_name);
        }
        if (!menu_enabled){
            return false;
        }

        var url = (gContextMenu && gContextMenu.linkURL);
        if (!url || !isRegisteredUrl(url)){
            return false;
        }

        return true;
    };

    ////////////////////////////////////////
    var VERSION_PREF = "version";
    var CURRENT_VERSION = "0.1.2";
    var WIKI_PAGE = "https://github.com/masamitsu-murase/open_tortoise_svn/wiki/Open-TortoiseSVN";

    var checkVersion = function(){
        var old_version = null;
        if (prefs.prefHasUserValue(VERSION_PREF)){
            old_version = prefs.getCharPref(VERSION_PREF);
            if (old_version == CURRENT_VERSION){
                return;
            }
        }

        switch(old_version){
          case null:
            // Initial version does not have "VERSION_PREF".
            // So no VERSION_PREF means that previous version is 0.0.3 or not installed.
            // Version 0.0.3 has the following preferences:
            //  - open_tortoise_svn.tortoise_svn_path_pref
            //  - open_tortoise_svn.url_list_pref.
            // I forgot to add "extensions." in version 0.0.3, so copy values carefully...
            {
                var root_pref = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
                if (!root_pref.prefHasUserValue("open_tortoise_svn.tortoise_svn_path_pref")
                     || !root_pref.prefHasUserValue("open_tortoise_svn.url_list_pref")){
                    break;
                }
                prefs.setComplexValue("tortoise_svn_path_pref", Ci.nsILocalFile,
                                      root_pref.getComplexValue("open_tortoise_svn.tortoise_svn_path_pref",
                                                                Ci.nsILocalFile));
                prefs.setCharPref("url_list_pref", root_pref.getCharPref("open_tortoise_svn.url_list_pref"));
            }
            // fall through
        case "0.1.0":
        case "0.1.1":
            // There is nothing to do when version is updated from 0.1.0 to 0.1.2.
            break;
        }

        prefs.setCharPref(VERSION_PREF, CURRENT_VERSION);
        setTimeout(function(){
            if (gBrowser){
                gBrowser.selectedTab = gBrowser.addTab(WIKI_PAGE);
            }
        }, 500);

        return true;
    };

    window.addEventListener("load", registerCallback, false);

    return {
        contextMenuOpenTortoiseSvn: contextMenuOpenTortoiseSvn
    };
})();

}
