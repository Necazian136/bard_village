import {zoneFilesList} from "@/components/track/note/ZoneHandler.ts";
import {Midi} from "@tonejs/midi";
import {Note} from "@tonejs/midi/dist/Note";
import {ZoneType} from "@/components/track/note/ZoneType";

export async function getZonesByMidiInstrumentNumber(midiNumber: number): Promise<ZoneType[]> {
    const zones = await getZoneDataByMidiNumber(midiNumber * 10)
    if (zones !== undefined) {
        return zones;
    }
}

export async function getZonesByMidiDrumsNumber(midiNumber: number): Promise<ZoneType[]> {
    const zones = await getZoneDataByMidiNumber(midiNumber)
    if (zones !== undefined) {
        return zones;
    }
}

export async function getZoneDataByMidiNumber(midiNumber: number) {
    const needle = midiNumber.toString().padStart(4,'0') + '_';
    for (const key in zoneFilesList) {
        if (key.includes(needle)) {
            console.log(key);
            return (await fetch(zoneFilesList[key])).json();
        }
    }
    return undefined;
}

export function getRealChannel(channel: number, note = undefined): number {
    if (channel !== 9 || note === undefined) {
        return channel;
    }
    return 12800 + note.midi;
}

export function getAllNotesFromChannel(channel: number, midi: Midi): Note[] {
    const result = [];
    midi.tracks.forEach((track) => {
        if (track.channel === channel) {
            track.notes.forEach((note) => {
                result.push(note);
            });
        }
    });
    return result;
}

export async function getMappedNotesFromZones(audioContext, zones) {
    const map = {}
    for (let zone of zones) {
        const baseDetune = Math.round( (zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune) / 100);
        map[baseDetune] = await getAudioBufferFromZone(audioContext, zone);
    }
    return map;
}

export async function getAudioBufferFromZone(audioContext, zone) {
    let buffer = null;
    if (zone.buffer) {
        buffer = zone.buffer;
    } else {
        zone.delay = 0;
        if (zone.sample) {
            const decoded = atob(zone.sample);
            zone.buffer = audioContext.createBuffer(1, decoded.length / 2, zone.sampleRate);
            buffer = zone.buffer;
            const float32Array = zone.buffer.getChannelData(0);
            let b1, b2, n;
            for (let i = 0; i < decoded.length / 2; i++) {
                b1 = decoded.charCodeAt(i * 2);
                b2 = decoded.charCodeAt(i * 2 + 1);
                if (b1 < 0) {
                    b1 = 256 + b1;
                }
                if (b2 < 0) {
                    b2 = 256 + b2;
                }
                n = b2 * 256 + b1;
                if (n >= 65536 / 2) {
                    n = n - 65536;
                }
                float32Array[i] = n / 65536.0;
            }
        } else {
            if (zone.file) {
                const datalen = zone.file.length;
                const arraybuffer = new ArrayBuffer(datalen);
                const view = new Uint8Array(arraybuffer);
                const decoded = atob(zone.file);
                let b;
                for (let i = 0; i < decoded.length; i++) {
                    b = decoded.charCodeAt(i);
                    view[i] = b;
                }
                zone.buffer = await audioContext.decodeAudioData(arraybuffer);
                buffer = zone.buffer;
            }
        }
    }
    return buffer;
}
