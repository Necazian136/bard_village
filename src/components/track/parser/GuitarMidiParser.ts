import {Midi} from "@tonejs/midi";
import {MidiParser} from "@/components/track/parser/MidiParser";

class GuitarMidiParser implements MidiParser {
    parse(midi: Midi, trackNumber: Number) {
        midi.tracks[trackNumber].notes.forEach((note) => {

        })
    }
}
