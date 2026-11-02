import type {Midi} from "@tonejs/midi";
import type {MidiParser} from "@/components/track/parser/MidiParser";
import type {Note} from "@tonejs/midi/dist/Note";

class GuitarMidiParser implements MidiParser {
    parse(midi: Midi, trackNumber: number) {
        midi.tracks[trackNumber].notes.forEach((note: Note) => {

        })
    }
}
