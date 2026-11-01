import {Note} from "@tonejs/midi/dist/Note";

export class TrackNode {
    notes: Note[];
    time: number;
    nextNode: TrackNode;

    constructor() {
        this.notes = [];
        this.time = 0;
    }
}
