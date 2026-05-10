
## core feature list:

- patient's conversations are recorded, data from what they say are used to fill in fields in the source of truth table for every patient

- doctors have the ability to edit generated patient status
when a doctor finishes making changes to a patient's record, a transfer of knowledge diff is generated for every other entity in the db (nurses / doctor)

- when a different doctor accesses a patient's record, they are presented with a diff from their last understanding of the patient and the up-to-date one.

- all finalized states of patient status are added to a changelog table - with the ability to expand to see prior versions

## added feature list:

- chat bot that queries all prior transcripts and medical records

- the doctor can upload their set of notes, and once this is finalized, questions/future notes for next doctors are added to the pattient profile, only based on what is explicitly asked by the professional, nothing is inferred by LLM yet -- just a button

upon triggering a transfer of knowledge, a session is started that listens to a conversations between professionals. a check list is generated for the main topics to cover between the most recently updated patient record and what the target professional doesn't know. as the conversation goes through and topics are covered, they are checked off. if there is something that is being missed, the screen highlights it as a sub bullet for a point in the check list.


- medical record documents with profiles

## stretch
- auto-filling out documents that the doctor needs to complete 


