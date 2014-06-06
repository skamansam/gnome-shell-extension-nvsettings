//
//       nvidiatemp@baco
//
//       Copyright © 2012 Dionisio E Alonso <dealonso@gmail.com>
//
//       This program is free software: you can redistribute it and/or modify
//       it under the terms of the GNU General Public License as published by
//       the Free Software Foundation, either version 3 of the License, or
//       (at your option) any later version.
//
//       This program is distributed in the hope that it will be useful,
//       but WITHOUT ANY WARRANTY; without even the implied warranty of
//       MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//       GNU General Public License for more details.
//
//       You should have received a copy of the GNU General Public License
//       along with this program.  If not, see <http://www.gnu.org/licenses/>.
//

const St = imports.gi.St;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const Mainloop = imports.mainloop;
const Extension = imports.misc.extensionUtils.getCurrentExtension()

function NvidiaTemperature() {
    this._init.apply(this, arguments);
}

NvidiaTemperature.prototype = {
    __proto__: PanelMenu.Button.prototype,

    _init: function(){
        PanelMenu.Button.prototype._init.call(this, 'nvidiatemp');

        // Set Logo
        var theme = imports.gi.Gtk.IconTheme.get_default();
        let icon_dir = Extension.dir.get_child('icons');
        theme.append_search_path(icon_dir.get_path());
        this._logo = new St.Icon({ icon_name: 'nvidia-card-symbolic',
                                 style_class: 'system-status-icon'});

        this.lang = {
            'gpu' : 'Nvidia GPU Core Temp'
        };
        this.statusLabel = new St.Label({
            text: "--",
            style_class: "temperature-label"
        });

        // destroy all previously created children, and add our statusLabel
        this.actor.get_children().forEach(function(c) {
            c.destroy()
        });
        // create a new box layout, composed of a) a "bin", b) the label
        let box = new St.BoxLayout({ name: 'tempBox' });
        this.actor.add_actor(box);
        box.add_actor(this._logo);
        box.add_actor(new St.Label({text: ' '}));
        box.add_actor(this.statusLabel);

        this.sensorsPath = this._detectSensors();
        this.command=["xdg-open", "http://bacox.com.ar/"];
        if(this.sensorsPath){
            if(!this._detectOptirun()) {
                this.title='Error';
                this.content='You do not appear to be using the NVIDIA X driver. Please\nedit your X configuration file (just run `nvidia-xconfig` as root),\nand restart the X server.\nIf it doesn\'t help, click here to report with your sensors output!';
            } else {
                this.title='Error';
                this.content='Please install nvidia-smi to run the extension properly.\nIf you see this error message is because you have Optirun\ninstalled on your system.';
            }
        }
        else{
            this.title='Warning';
            this.content='Please install nvidia-smi or nvidia-settings. If it doesn\'t help, click here to report with your sensors output!';
        }

        this._update_temp();
        // update every 15 seconds
        event = GLib.timeout_add_seconds(0, 15, Lang.bind(this, function () {
            this._update_temp();
            return true;
        }));
    },

    _detectSensors: function(){
        // detect if nvidia-smi or nvidia-settings is installed
        let ret = GLib.find_program_in_path("nvidia-smi");
        if (!ret) { // if no
            ret = GLib.find_program_in_path("nvidia-settings");
        }
        return ret; // path to Nvidia tools program or empty string.
    },

    _detectOptirun: function() {
        // detect if optirun is installed.
        let ret = GLib.find_program_in_path("optirun");
        if (ret) { // if yes
            return true;
        }
        return false;
    },

    _update_temp: function() {
        let items = new Array();
        let tempInfo=null;
        if (this.sensorsPath){
            let sensors_output = '';
            if (this.sensorsPath.substr(16)=='smi') {
                sensors_output = GLib.spawn_command_line_sync(this.sensorsPath + " -q -d temperature"); // get the output of the nvidia-smi command.
            } else if (!this._detectOptirun()) {
                sensors_output = GLib.spawn_command_line_sync(this.sensorsPath + " -q GPUCoreTemp -t"); // get the output of the nvidia-settings command.
            }
            if(sensors_output[0]) tempInfo = this._findTemperatureFromSensorsOutput(sensors_output[1].toString()); // get temp from either command output.

            // Parse all temperature values and save them.
            if (tempInfo){
                // destroy all items in popup
                this.menu.box.get_children().forEach(function(c) {
                    c.destroy()
                });
                var s=0, n=0; // sum and count
                for (let adapter in tempInfo){
                    if(adapter!=0){
                        if (tempInfo[adapter]['temp']>0){
                            s+=tempInfo[adapter]['temp'];
                            n++;
                            items.push(this.lang[adapter] + ' : '+this._formatTemp(tempInfo[adapter]['temp']));
                        }
                    }
                }
                if (n!=0) { // if temperature is detected
                    this.title=this._formatTemp(s/n); // set title as average
                }
                else if (this._detectOptirun() && this.sensorsPath.substr(16)=='smi') { // Try to detect if card is on or not.
                    this.title='Off';
                    items.push('GPU temperature will be shown when the card is active.');
                }
            }
        }
        // if we don't have the temperature yet, use some known files
        if(!tempInfo){
            tempInfo = this._findTemperatureFromFiles();
            if(tempInfo.temp){
                this.menu.box.get_children().forEach(function(c) {
                    c.destroy()
                });
                this.title=this._formatTemp(tempInfo.temp);
                items.push('Current GPU Temperature : '+this._formatTemp(tempInfo.temp));
                if (tempInfo.crit)
                    items.push('Critical GPU Temperature : '+this._formatTemp(tempInfo.crit));
            }
        }

        // Insert values into the applet.
        this.statusLabel.set_text(this.title);
        this.menu.box.get_children().forEach(function(c) {
            c.destroy()
        });
        let section = new PopupMenu.PopupMenuSection("GPU Temperature");
        if (items.length>0){
            let item;
            for each (let itemText in items){
                item = new PopupMenu.PopupMenuItem("", { reactive: false });
                item.actor.add(new St.Label({
                    text:itemText,
                    style_class: "sm-label"
                }));
                section.addMenuItem(item);
            }
        }else{ // or open a browser to report the issue.
            let command=this.command;
            let item;
            item = new PopupMenu.PopupMenuItem("");
            item.actor.add(new St.Label({
                text:this.content,
                style_class: "sm-label"
            }));
            item.connect('activate',function() {
                Util.spawn(command);
            });
            section.addMenuItem(item);
        }
        this.menu.addMenuItem(section);
    },

//    _createSectionForText: function(txt){
//        let section = new PopupMenu.PopupMenuSection("GPU Temperature");
//        let item = new PopupMenu.PopupMenuItem("");
//        item.actor.add(new St.Label({
//            text:txt,
//            style_class: "sm-label"
//        }));
//        section.addMenuItem(item);
//        return section;
//    },

    _findTemperatureFromFiles: function(){
        let info = new Array();
        let temp_files = [
        // Debian Sid/Experimental using Nouveau driver
        '/sys/class/hwmon/hwmon1/device/temp1_input'];
        for each (let file in temp_files){
            if(GLib.file_test(file,1<<4)){
                let temperature = GLib.file_get_contents(file);
                if(temperature[0]) {
                    info['temp']= parseInt(temperature[1])/1000;
                }
            }
            break;
        }
        let crit_files = [
        // Debian Sid/Experimental using Nouveau driver
        '/sys/class/hwmon/hwmon1/device/temp1_crit'];
        for each (let file in crit_files){
            if(GLib.file_test(file,1<<4)){
                let temperature = GLib.file_get_contents(file);
                if(temperature[0]) {
                    info['crit']= parseInt(temperature[1])/1000;
                }
            }
        }
        return info;
    },

    _findTemperatureFromSensorsOutput: function(txt){
        let senses_lines=txt.split("\n");
        let line = '';
        let type = '';
        let s= new Array();
        let n=0,c=0;
        let f;
        // iterate through each lines
        for(let i = 0; i < senses_lines.length; i++) {
            line = senses_lines[i];
            if(senses_lines[i]){
                let nvtool = this.sensorsPath.substr(16);
                switch (nvtool) {
                    case 'settings':
                        s['gpu'] = new Array();
                        s['gpu']['temp']=parseFloat(senses_lines[i].substr(0,2));
                        c++;
                    case 'smi':
                        // remove all space characters
                        senses_lines[i]=senses_lines[i].replace(/\s/g, "");
                        if(senses_lines[i].substr(0,3)=='Gpu'){
                            s['gpu'] = new Array();
                            s['gpu']['temp']=parseFloat(senses_lines[i].substr(4,2));
                            c++;
                        }

                    default:
                        break;
                }
            }
        }
        return s;
    },

    _toFahrenheit: function(c){
        return ((9/5)*c+32).toFixed(0);
    },

    _getContent: function(c){
        return c.toString()+" \u00b0C / "+this._toFahrenheit(c).toString()+" \u00b0F";
    },

    _formatTemp: function(t) {
        // uncomment the next line to display temperature in Fahrenheit
        // return this._toFahrenheit(t).toString()+" \u00b0F";
        return (Math.round(t*10)/10).toFixed(0).toString()+" \u00b0C";
    }
}

// for debugging
function debug(a){
    global.log(a);
    Util.spawn(['echo',a]);
}

function init() {
// do nothing
}

let indicator;
let event=null;

function enable() {
    indicator = new NvidiaTemperature();
    Main.panel.addToStatusArea('nvidiatemp', indicator);
}

function disable() {
    indicator.destroy();
    Mainloop.source_remove(event);
    indicator = null;
}
