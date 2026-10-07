export const seedState = {
  courses: [
    {
      id: "course_cs101",
      name: "Neural Networks",
      code: "CS 101",
      professor: "Professor Rivera",
      term: "Fall",
      examDates: ["2026-11-18"],
      lectures: [],
      memory: {
        lectureCount: 0,
        summary: "",
        keyTerms: [],
        updatedAt: null
      },
      progress: {
        completedExercises: 0,
        totalExercises: 0,
        percent: 0
      }
    }
  ]
};

export const sampleLecture = {
  title: "Lecture 5: Neural Networks",
  recordedAt: "2026-10-07T14:00:00.000Z",
  transcript: `
    Neural networks are layered models that learn patterns by adjusting weights.
    The professor compared each neuron to a tiny decision unit that receives inputs,
    applies a weight, adds a bias, and sends an activation forward.
    We focused on why activation functions matter, because without nonlinear activation
    the whole network collapses into something similar to a linear model.
    Backpropagation was introduced as the method for measuring error and pushing that
    error backward through the layers so each weight can improve.
    The most important exam connection was understanding the difference between
    memorizing a training set and generalizing to new examples.
  `
};
